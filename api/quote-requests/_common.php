<?php
// Shared helpers for the quote-request (site walk) endpoints.
//
// Visibility: admins see every request; field managers see only requests
// they created or were assigned to walk (field_manager_id). PMs have no
// access at all — every quote endpoint calls requireAuth(QR_ROLES), which
// leaves 'pm' out.
//
// Field managers may only edit while a request is still in their hands
// (draft / needs_info). Once approved, the scope is locked until an admin
// reopens it.

require_once __DIR__ . '/../services/notify.php';

const QR_ROLES = ['admin', 'field'];

const QR_STATUSES = ['draft', 'submitted', 'needs_info', 'in_review', 'approved', 'estimating', 'sent', 'accepted', 'declined', 'cancelled',
                     'scheduled', 'done', 'invoiced'];
// With a PO the office writes an estimate (approve → estimate → sent →
// accepted); without one the work is scheduled, done, then invoiced.
const QR_BILLING = ['po', 'no_po'];
// The PO choice can change until the job is committed to one path.
const QR_BILLING_OPEN_STATUSES = ['draft', 'submitted', 'needs_info', 'in_review'];
const QR_FIELD_EDITABLE_STATUSES = ['draft', 'needs_info'];
const QR_ESTIMATE_TYPES = ['standard', 'addon', 'emergency', 'alternative', 'line_item'];
const QR_SOURCES = ['email', 'text', 'phone', 'site_meeting', 'work_order', 'other'];
const QR_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const QR_UPLOAD_DIR = __DIR__ . '/../uploads/quote-requests';

// "Q-0012" from quote_number; null for an unsaved site walk (no number yet).
function qrRequestNo($quoteNumber): ?string {
    if ($quoteNumber === null || $quoteNumber === '') return null;
    return 'Q-' . str_pad((string)(int)$quoteNumber, 4, '0', STR_PAD_LEFT);
}

// Gives a request its Q-number the first time it's saved. Numbers come from
// their own counter (not the row id), so discarded unsaved walks leave no
// gaps. The UNIQUE key settles any race between two saves; retry on a clash.
function qrAssignNumber(PDO $pdo, int $id): void {
    for ($attempt = 0; $attempt < 5; $attempt++) {
        $s = $pdo->prepare('SELECT quote_number FROM quote_requests WHERE id = ?');
        $s->execute([$id]);
        if ($s->fetchColumn() !== null) return;
        $next = (int)$pdo->query('SELECT COALESCE(MAX(quote_number), 0) + 1 FROM quote_requests')->fetchColumn();
        try {
            $pdo->prepare('UPDATE quote_requests SET quote_number = ? WHERE id = ? AND quote_number IS NULL')->execute([$next, $id]);
            return;
        } catch (PDOException $e) {
            if ($e->getCode() !== '23000') throw $e;
        }
    }
    throw new RuntimeException('Could not assign a quote number — try again');
}

function qrIsAdmin(array $auth): bool {
    return $auth['role'] === 'admin';
}

// Loads a request and enforces visibility, exiting 404 for anything the
// caller may not see (404 rather than 403 so ids can't be probed).
function qrLoadVisible(PDO $pdo, array $auth, int $id): array {
    $stmt = $pdo->prepare('SELECT * FROM quote_requests WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row || !qrCanView($auth, $row)) {
        http_response_code(404); exit(json_encode(['error' => 'Quote request not found']));
    }
    return $row;
}

function qrCanView(array $auth, array $row): bool {
    if (qrIsAdmin($auth)) return true;
    return (int)$row['created_by'] === $auth['user_id'] || (int)$row['field_manager_id'] === $auth['user_id'];
}

function qrFieldCanEdit(array $auth, array $row): bool {
    return !qrIsAdmin($auth) && qrCanView($auth, $row) && in_array($row['status'], QR_FIELD_EDITABLE_STATUSES, true);
}

function qrLogActivity(PDO $pdo, int $requestId, array $auth, string $action, ?string $from = null, ?string $to = null, ?string $note = null): void {
    $pdo->prepare(
        'INSERT INTO quote_request_activity (quote_request_id, action, from_status, to_status, note, actor_id, actor_name) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute([$requestId, $action, $from, $to, $note !== null ? mb_substr($note, 0, 500) : null, $auth['user_id'], $auth['name']]);
}

function qrSnapshot(PDO $pdo, array $row, array $auth, string $kind, ?string $note = null): void {
    $pdo->prepare(
        'INSERT INTO quote_request_versions (quote_request_id, kind, form_json, scope_text, note, created_by, created_by_name) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute([$row['id'], $kind, $row['form_json'], $row['scope_text'], $note, $auth['user_id'], $auth['name']]);
}

// notifications.project_number is NOT NULL; requests for a new job have no
// project yet, so they carry ''.
function qrNotifyUser(PDO $pdo, ?int $userId, array $row, string $type, string $title, ?string $body, ?int $skipUserId = null): void {
    if (!$userId || $userId === $skipUserId) return;
    notifyStaff($pdo, $userId, (string)($row['project_number'] ?? ''), $type, $title, $body !== null ? mb_substr($body, 0, 255) : null, '/quotes/' . $row['id']);
}

// The assigned estimator if there is one, otherwise every active admin.
function qrNotifyOffice(PDO $pdo, array $row, string $type, string $title, ?string $body, ?int $skipUserId = null): void {
    if (!empty($row['assigned_to'])) {
        qrNotifyUser($pdo, (int)$row['assigned_to'], $row, $type, $title, $body, $skipUserId);
        return;
    }
    $ids = $pdo->query("SELECT fieldclock_user_id FROM projects_staff_roles WHERE role = 'admin' AND is_active = 1")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($ids as $id) qrNotifyUser($pdo, (int)$id, $row, $type, $title, $body, $skipUserId);
}

// The field side of a request: whoever is walking it, else whoever created it
// (when that was a field manager).
function qrFieldUserId(array $row): ?int {
    if (!empty($row['field_manager_id'])) return (int)$row['field_manager_id'];
    return null;
}

function qrStaffName(PDO $pdo, int $userId, array $roles): ?string {
    $placeholders = implode(',', array_fill(0, count($roles), '?'));
    $stmt = $pdo->prepare("SELECT name FROM projects_staff_roles WHERE fieldclock_user_id = ? AND is_active = 1 AND role IN ($placeholders)");
    $stmt->execute(array_merge([$userId], $roles));
    $name = $stmt->fetchColumn();
    return $name === false ? null : $name;
}

function qrValidDate(?string $v): ?string {
    if ($v === null || $v === '') return null;
    $d = DateTime::createFromFormat('Y-m-d', $v);
    if (!$d || $d->format('Y-m-d') !== $v) {
        http_response_code(422); exit(json_encode(['error' => 'Invalid date: ' . $v]));
    }
    return $v;
}

function qrValidDateTime(?string $v): ?string {
    if ($v === null || $v === '') return null;
    // Phones send ISO-8601 in UTC ("...Z"); store it in the app's own timezone
    // like every other DATETIME column.
    try { return (new DateTime($v))->setTimezone(new DateTimeZone(date_default_timezone_get()))->format('Y-m-d H:i:s'); }
    catch (Throwable $e) { http_response_code(422); exit(json_encode(['error' => 'Invalid date/time: ' . $v])); }
}

// Shapes a DB row for the API. Field managers don't get the office-only
// follow-up settings, decline reason or filed-document link.
function qrPresent(array $row, array $auth): array {
    $out = $row;
    $out['id'] = (int)$row['id'];
    $out['request_no'] = qrRequestNo($row['quote_number'] ?? null);
    $out['is_saved'] = isset($row['quote_number']) && $row['quote_number'] !== null;
    unset($out['quote_number']);
    foreach (['customer_id', 'contact_id', 'calendar_event_id', 'field_manager_id', 'assigned_to', 'document_id', 'created_by', 'follow_up_days'] as $k) {
        if (array_key_exists($k, $row)) $out[$k] = $row[$k] !== null ? (int)$row[$k] : null;
    }
    $out['form'] = !empty($row['form_json']) ? json_decode($row['form_json'], true) : null;
    unset($out['form_json']);
    if (!qrIsAdmin($auth)) {
        unset($out['decline_reason'], $out['follow_up_days'], $out['last_reminded_at'], $out['document_id']);
    }
    return $out;
}

// Applies the editable request fields present in $body to $sets/$params.
// Shared by create (index.php POST) and update (item.php PATCH).
function qrCollectFields(PDO $pdo, array $body, array $auth, array &$sets, array &$params): void {
    $str = function (string $key, int $max) use ($body, &$sets, &$params) {
        if (!array_key_exists($key, $body)) return;
        $v = $body[$key] === null ? '' : sanitizeString($body[$key]);
        $sets[] = "$key = ?"; $params[] = $v === '' ? null : mb_substr($v, 0, $max);
    };

    if (array_key_exists('title', $body)) {
        $title = sanitizeString($body['title']);
        if ($title === '') { http_response_code(422); exit(json_encode(['error' => 'Title is required'])); }
        $sets[] = 'title = ?'; $params[] = mb_substr($title, 0, 200);
    }
    if (array_key_exists('work_type', $body)) {
        if (!in_array($body['work_type'], ['new', 'addon'], true)) { http_response_code(422); exit(json_encode(['error' => 'Invalid work type'])); }
        $sets[] = 'work_type = ?'; $params[] = $body['work_type'];
    }
    if (array_key_exists('billing', $body)) {
        if (!in_array($body['billing'], QR_BILLING, true)) { http_response_code(422); exit(json_encode(['error' => 'Choose with PO or without PO'])); }
        $sets[] = 'billing = ?'; $params[] = $body['billing'];
    }
    if (array_key_exists('estimate_type', $body)) {
        if (!in_array($body['estimate_type'], QR_ESTIMATE_TYPES, true)) { http_response_code(422); exit(json_encode(['error' => 'Invalid estimate type'])); }
        $sets[] = 'estimate_type = ?'; $params[] = $body['estimate_type'];
    }
    if (array_key_exists('priority', $body)) {
        if (!in_array($body['priority'], QR_PRIORITIES, true)) { http_response_code(422); exit(json_encode(['error' => 'Invalid priority'])); }
        $sets[] = 'priority = ?'; $params[] = $body['priority'];
    }
    if (array_key_exists('request_source', $body)) {
        $src = $body['request_source'] ?: null;
        if ($src !== null && !in_array($src, QR_SOURCES, true)) { http_response_code(422); exit(json_encode(['error' => 'Invalid request source'])); }
        $sets[] = 'request_source = ?'; $params[] = $src;
    }
    if (array_key_exists('project_number', $body)) {
        $pn = trim((string)($body['project_number'] ?? ''));
        if ($pn !== '' && !preg_match('/^\d{4}$/', $pn)) { http_response_code(422); exit(json_encode(['error' => 'Estimate # must be exactly 4 digits'])); }
        $sets[] = 'project_number = ?'; $params[] = $pn === '' ? null : $pn;
    }
    if (array_key_exists('customer_id', $body)) {
        $cid = $body['customer_id'] ? (int)$body['customer_id'] : null;
        if ($cid) {
            $c = $pdo->prepare('SELECT id FROM customers WHERE id = ?');
            $c->execute([$cid]);
            if (!$c->fetch()) { http_response_code(422); exit(json_encode(['error' => 'That client is no longer on the list'])); }
        }
        $sets[] = 'customer_id = ?'; $params[] = $cid;
    }
    $str('facility', 200);
    $str('location_detail', 255);
    $str('original_estimate_no', 20);
    $str('related_ref', 60);
    $str('description', 20000);
    if (array_key_exists('needed_by', $body))       { $sets[] = 'needed_by = ?';       $params[] = qrValidDate($body['needed_by'] ?: null); }
    if (array_key_exists('site_visit_date', $body)) { $sets[] = 'site_visit_date = ?'; $params[] = qrValidDate($body['site_visit_date'] ?: null); }
    if (array_key_exists('form', $body)) {
        if ($body['form'] !== null && !is_array($body['form'])) { http_response_code(422); exit(json_encode(['error' => 'form must be an object'])); }
        $json = $body['form'] === null ? null : json_encode($body['form'], JSON_UNESCAPED_UNICODE);
        if ($json !== null && strlen($json) > 4 * 1024 * 1024) { http_response_code(422); exit(json_encode(['error' => 'Site-visit form is too large'])); }
        $sets[] = 'form_json = ?'; $params[] = $json;
    }

    // Office-only fields.
    if (!qrIsAdmin($auth)) return;

    if (array_key_exists('field_manager_id', $body)) {
        $fid = $body['field_manager_id'] ? (int)$body['field_manager_id'] : null;
        $name = null;
        if ($fid) {
            $name = qrStaffName($pdo, $fid, ['field', 'admin']);
            if ($name === null) { http_response_code(422); exit(json_encode(['error' => 'Field manager not found'])); }
        }
        $sets[] = 'field_manager_id = ?'; $params[] = $fid;
        $sets[] = 'field_manager_name = ?'; $params[] = $name;
    }
    if (array_key_exists('assigned_to', $body)) {
        $aid = $body['assigned_to'] ? (int)$body['assigned_to'] : null;
        $name = null;
        if ($aid) {
            $name = qrStaffName($pdo, $aid, ['admin']);
            if ($name === null) { http_response_code(422); exit(json_encode(['error' => 'Estimator must be an active admin'])); }
        }
        $sets[] = 'assigned_to = ?'; $params[] = $aid;
        $sets[] = 'assigned_to_name = ?'; $params[] = $name;
    }
    if (array_key_exists('follow_up_days', $body)) {
        $days = (int)$body['follow_up_days'];
        if ($days < 1 || $days > 90) { http_response_code(422); exit(json_encode(['error' => 'Follow-up must be 1–90 days'])); }
        $sets[] = 'follow_up_days = ?'; $params[] = $days;
    }
    if (array_key_exists('site_visit_at', $body)) { $sets[] = 'site_visit_at = ?'; $params[] = qrValidDateTime($body['site_visit_at'] ?: null); }
    if (array_key_exists('estimate_number', $body)) {
        $en = trim((string)($body['estimate_number'] ?? ''));
        if ($en !== '' && !preg_match('/^[A-Za-z0-9-]{1,20}$/', $en)) { http_response_code(422); exit(json_encode(['error' => 'Invalid estimate #'])); }
        $sets[] = 'estimate_number = ?'; $params[] = $en === '' ? null : $en;
    }
}

// Shared upload validation. Returns [tmpPath, ext, originalName].
function qrAcceptUpload(array $allowedMime, int $maxBytes): array {
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(422); exit(json_encode(['error' => 'No file uploaded']));
    }
    $file = $_FILES['file'];
    if ($file['size'] > $maxBytes) {
        http_response_code(422); exit(json_encode(['error' => 'File is too large (' . round($maxBytes / 1048576) . 'MB max)']));
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime  = finfo_file($finfo, $file['tmp_name']);
    if (!isset($allowedMime[$mime])) {
        http_response_code(422); exit(json_encode(['error' => 'Unsupported file type']));
    }
    return [$file['tmp_name'], $allowedMime[$mime], mb_substr(basename((string)$file['name']), 0, 255)];
}

function qrStoreUpload(int $requestId, string $tmp, string $ext): string {
    if (!is_dir(QR_UPLOAD_DIR)) { mkdir(QR_UPLOAD_DIR, 0755, true); }
    $filename = "{$requestId}-" . bin2hex(random_bytes(8)) . ".{$ext}";
    if (!move_uploaded_file($tmp, QR_UPLOAD_DIR . '/' . $filename)) {
        http_response_code(500); exit(json_encode(['error' => 'Could not save the file']));
    }
    return "quote-requests/{$filename}";
}

// Rows from a table added by a later migration. If that migration hasn't been
// run on this server yet (table / column missing), return [] instead of
// failing the whole request — the request still opens, just without that part.
function qrOptionalRows(PDO $pdo, string $sql, array $params): array {
    try {
        $s = $pdo->prepare($sql);
        $s->execute($params);
        return $s->fetchAll();
    } catch (PDOException $e) {
        if (in_array($e->getCode(), ['42S02', '42S22'], true)) {
            error_log('quote-requests: optional query skipped (run the pending migration): ' . $e->getMessage());
            return [];
        }
        throw $e;
    }
}

function qrFileUrl(string $relativePath): string {
    return APP_URL . '/uploads/' . $relativePath;
}

// ── Workflow ────────────────────────────────────────────────────────────────
// action => [who, from-statuses, to-status]. The single source of truth for
// both action.php (enforcement) and the detail payload's `actions` list
// (which buttons the UI shows).
const QR_ACTIONS = [
    'submit'        => ['roles' => ['admin', 'field'], 'from' => ['draft', 'needs_info'],             'to' => 'submitted'],
    'start_review'  => ['roles' => ['admin'],          'from' => ['draft', 'submitted'],              'to' => 'in_review'],
    'request_info'  => ['roles' => ['admin'],          'from' => ['submitted', 'in_review'],          'to' => 'needs_info'],
    // With a PO: estimate.
    'approve'       => ['roles' => ['admin'],          'from' => ['submitted', 'in_review'],          'to' => 'approved',  'billing' => 'po'],
    'reopen'        => ['roles' => ['admin'],          'from' => ['approved', 'estimating'],          'to' => 'in_review', 'billing' => 'po'],
    'set_estimate'  => ['roles' => ['admin'],          'from' => ['approved', 'estimating', 'sent'],  'to' => null,        'billing' => 'po'], // approved→estimating, else unchanged
    'mark_sent'     => ['roles' => ['admin'],          'from' => ['approved', 'estimating'],          'to' => 'sent',      'billing' => 'po'],
    'accept'        => ['roles' => ['admin'],          'from' => ['sent'],                            'to' => 'accepted',  'billing' => 'po'],
    'decline'       => ['roles' => ['admin'],          'from' => ['sent'],                            'to' => 'declined',  'billing' => 'po'],
    'undo_decision' => ['roles' => ['admin'],          'from' => ['accepted', 'declined'],            'to' => 'sent',      'billing' => 'po'],
    // Without a PO: schedule (also reschedules) → done → invoiced.
    'schedule'      => ['roles' => ['admin'],          'from' => ['draft', 'submitted', 'in_review', 'scheduled'], 'to' => 'scheduled', 'billing' => 'no_po'],
    'unschedule'    => ['roles' => ['admin'],          'from' => ['scheduled'],                       'to' => 'in_review', 'billing' => 'no_po'],
    'mark_done'     => ['roles' => ['admin', 'field'], 'from' => ['scheduled'],                       'to' => 'done',      'billing' => 'no_po'],
    'undo_done'     => ['roles' => ['admin'],          'from' => ['done'],                            'to' => 'scheduled', 'billing' => 'no_po'],
    'mark_invoiced' => ['roles' => ['admin'],          'from' => ['done'],                            'to' => 'invoiced',  'billing' => 'no_po'],
    'undo_invoiced' => ['roles' => ['admin'],          'from' => ['invoiced'],                        'to' => 'done',      'billing' => 'no_po'],
    'cancel'        => ['roles' => ['admin', 'field'], 'from' => ['draft', 'submitted', 'needs_info', 'in_review', 'approved', 'estimating', 'sent', 'scheduled', 'done'], 'to' => 'cancelled'],
    'restore'       => ['roles' => ['admin'],          'from' => ['cancelled'],                       'to' => 'draft'],
];

// Statuses in which the scope is frozen (approved and everything after it).
const QR_SCOPE_LOCKED = ['approved', 'estimating', 'sent', 'accepted', 'declined', 'cancelled', 'scheduled', 'done', 'invoiced'];

function qrActionAllowed(array $auth, array $row, string $action): bool {
    $def = QR_ACTIONS[$action] ?? null;
    if (!$def || !in_array($auth['role'], $def['roles'], true) || !in_array($row['status'], $def['from'], true)) return false;
    if (isset($def['billing']) && ($row['billing'] ?? 'po') !== $def['billing']) return false;
    if (!qrIsAdmin($auth)) {
        if (!qrCanView($auth, $row)) return false;
        // A field manager can only withdraw their own draft.
        if ($action === 'cancel' && $row['status'] !== 'draft') return false;
        // …and mark the work done on a job they're the field manager for.
        if ($action === 'mark_done' && qrFieldUserId($row) !== $auth['user_id']) return false;
    }
    return true;
}

function qrAvailableActions(array $auth, array $row): array {
    return array_values(array_filter(array_keys(QR_ACTIONS), fn($a) => qrActionAllowed($auth, $row, $a)));
}

// ── Estimate recipients (client users) ──────────────────────────────────────
// Who the estimate is for. They're client-portal users (clients table), not a
// separate customer list, so accepting the quote can hand them portal access
// to the project directly.

// Validates a recipient_ids payload; returns the cleaned id list.
function qrCleanRecipientIds(PDO $pdo, $ids): array {
    if ($ids === null) return [];
    if (!is_array($ids)) { http_response_code(422); exit(json_encode(['error' => 'recipient_ids must be a list'])); }
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn($v) => $v > 0)));
    if (!$ids) return [];
    if (count($ids) > 50) { http_response_code(422); exit(json_encode(['error' => 'Too many recipients'])); }
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("SELECT id FROM clients WHERE is_active = 1 AND id IN ($ph)");
    $stmt->execute($ids);
    $found = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    if (count($found) !== count($ids)) { http_response_code(422); exit(json_encode(['error' => 'One of the recipients is no longer an active client'])); }
    return $ids;
}

function qrSetRecipients(PDO $pdo, int $requestId, array $ids): void {
    $pdo->prepare('DELETE FROM quote_request_recipients WHERE quote_request_id = ?')->execute([$requestId]);
    $ins = $pdo->prepare('INSERT INTO quote_request_recipients (quote_request_id, client_id) VALUES (?, ?)');
    foreach ($ids as $cid) $ins->execute([$requestId, $cid]);
}

function qrRecipients(PDO $pdo, int $requestId): array {
    $stmt = $pdo->prepare(
        'SELECT c.id, c.name, c.email, c.phone, c.company FROM quote_request_recipients r
         JOIN clients c ON c.id = r.client_id WHERE r.quote_request_id = ? ORDER BY c.name'
    );
    $stmt->execute([$requestId]);
    return array_map(function ($r) { $r['id'] = (int)$r['id']; return $r; }, $stmt->fetchAll());
}

// Gives every recipient client-portal access to the request's project.
// Returns how many access rows were newly added.
function qrGrantRecipientsAccess(PDO $pdo, array $row): int {
    if (empty($row['project_number'])) return 0;
    $stmt = $pdo->prepare(
        'INSERT IGNORE INTO client_project_access (client_id, project_number)
         SELECT r.client_id, ? FROM quote_request_recipients r JOIN clients c ON c.id = r.client_id
         WHERE r.quote_request_id = ? AND c.is_active = 1'
    );
    $stmt->execute([$row['project_number'], $row['id']]);
    return $stmt->rowCount();
}

// The job's client (from the client list), with the details the field
// manager may need on site.
function qrCustomer(PDO $pdo, ?int $customerId): ?array {
    if (!$customerId) return null;
    $rows = qrOptionalRows($pdo, 'SELECT id, name, contact_name, email, phone, mobile, address, ship_address, notes, is_active FROM customers WHERE id = ?', [$customerId]);
    if (!$rows) return null;
    $rows[0]['id'] = (int)$rows[0]['id'];
    $rows[0]['is_active'] = (int)$rows[0]['is_active'];
    return $rows[0];
}
