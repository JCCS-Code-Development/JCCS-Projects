<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../services/inventory_client.php';

// Every status change goes through here (POST {id, action, note?, ...}) so
// the transition rules in QR_ACTIONS are enforced in exactly one place and
// every change lands in quote_request_activity.
$auth = requireAuth(QR_ROLES);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$pdo    = getPDO();
$body   = jsonBody();
$id     = (int)($body['id'] ?? 0);
$action = (string)($body['action'] ?? '');
$note   = isset($body['note']) ? trim((string)$body['note']) : '';
if (!$id || $action === '') { http_response_code(422); exit(json_encode(['error' => 'Missing id or action'])); }

$acceptedProject = null;
$pdo->beginTransaction();
try {
    // Row lock so two people clicking at once can't both transition it.
    $stmt = $pdo->prepare('SELECT * FROM quote_requests WHERE id = ? FOR UPDATE');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row || !qrCanView($auth, $row)) {
        $pdo->rollBack();
        http_response_code(404); exit(json_encode(['error' => 'Quote request not found']));
    }
    if (!qrActionAllowed($auth, $row, $action)) {
        $pdo->rollBack();
        http_response_code(409); exit(json_encode(['error' => "Can't {$action} a request that is {$row['status']}"]));
    }

    $from = $row['status'];
    $to   = QR_ACTIONS[$action]['to'];
    $sets = []; $params = [];
    $fail = function (string $msg) use ($pdo) { $pdo->rollBack(); http_response_code(422); exit(json_encode(['error' => $msg])); };

    switch ($action) {
        case 'submit':
            if (trim((string)$row['title']) === '') $fail('Add a title before submitting');
            if (trim((string)$row['facility']) === '' && !$row['customer_id']) $fail('Add the facility or customer before submitting');
            $nc = $pdo->prepare("SELECT COUNT(*) FROM quote_request_notes WHERE quote_request_id = ? AND body IS NOT NULL AND body <> ''");
            $nc->execute([$id]);
            if (trim((string)$row['description']) === '' && !$row['form_json'] && !(int)$nc->fetchColumn()) $fail('Describe the work before submitting');
            if ($row['work_type'] === 'addon' && !$row['project_number']) $fail('Pick the project this add-on belongs to');
            $sets[] = 'submitted_at = NOW()';
            qrAssignNumber($pdo, $id); // submitting always saves
            if (!$row['site_visit_date'] && !qrIsAdmin($auth)) { $sets[] = 'site_visit_date = CURDATE()'; }
            break;

        case 'request_info':
            if ($note === '') $fail('Say what information is missing');
            if (!qrFieldUserId($row)) $fail('Assign a field manager first — there is no one to ask');
            break;

        case 'approve':
            if (trim((string)$row['scope_text']) === '') $fail('Write or generate the Scope of Work before approving');
            $sets[] = 'approved_at = NOW()';
            $sets[] = 'approved_by_name = ?'; $params[] = $auth['name'];
            break;

        case 'set_estimate':
            $en = trim((string)($body['estimate_number'] ?? ''));
            if (!preg_match('/^[A-Za-z0-9-]{1,20}$/', $en)) $fail('Enter the InvoiceToGo Estimate #');
            $sets[] = 'estimate_number = ?'; $params[] = $en;
            $to = $from === 'approved' ? 'estimating' : $from;
            $note = $note !== '' ? $note : "Estimate #{$en}";
            break;

        case 'mark_sent':
            $en = trim((string)($body['estimate_number'] ?? $row['estimate_number'] ?? ''));
            if (!preg_match('/^[A-Za-z0-9-]{1,20}$/', $en)) $fail('Enter the InvoiceToGo Estimate # before marking it sent');
            $sets[] = 'estimate_number = ?'; $params[] = $en;
            $sets[] = 'sent_at = NOW()';
            $sets[] = 'last_reminded_at = NULL';
            break;

        case 'accept':
            $sets[] = 'decided_at = NOW()';
            $sets[] = 'decline_reason = NULL';
            // A won new job becomes a project under its InvoiceToGo Estimate #
            // (the shared 4-digit job number every JCCS app keys on).
            if (empty($row['project_number']) && preg_match('/^\d{4}$/', (string)$row['estimate_number'])) {
                $sets[] = 'project_number = ?'; $params[] = $row['estimate_number'];
            }
            break;

        case 'decline':
            if ($note === '') $fail('Add the reason it was declined');
            $sets[] = 'decided_at = NOW()';
            $sets[] = 'decline_reason = ?'; $params[] = mb_substr($note, 0, 255);
            break;

        case 'undo_decision':
            $sets[] = 'decided_at = NULL';
            $sets[] = 'decline_reason = NULL';
            break;
    }

    $sets[] = 'status = ?'; $params[] = $to;
    $params[] = $id;
    $pdo->prepare('UPDATE quote_requests SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    $stmt = $pdo->prepare('SELECT * FROM quote_requests WHERE id = ?');
    $stmt->execute([$id]);
    $updated = $stmt->fetch();

    qrLogActivity($pdo, $id, $auth, $action, $from, $to, $note !== '' ? $note : null);

    // Side effects: version snapshots, thread entries, notifications.
    $title = $updated['title'];
    switch ($action) {
        case 'submit':
            qrSnapshot($pdo, $updated, $auth, 'field_submission');
            if ($from === 'needs_info' && $note !== '') {
                $pdo->prepare("INSERT INTO quote_request_comments (quote_request_id, kind, body, author_id, author_name) VALUES (?, 'info_response', ?, ?, ?)")
                    ->execute([$id, $note, $auth['user_id'], $auth['name']]);
            }
            qrNotifyOffice($pdo, $updated, $from === 'needs_info' ? 'quote_info_provided' : 'quote_submitted',
                ($from === 'needs_info' ? 'Info added: ' : 'New site walk: ') . $title,
                $updated['facility'] ?: $auth['name'], $auth['user_id']);
            break;

        case 'request_info':
            $pdo->prepare("INSERT INTO quote_request_comments (quote_request_id, kind, body, author_id, author_name) VALUES (?, 'info_request', ?, ?, ?)")
                ->execute([$id, $note, $auth['user_id'], $auth['name']]);
            qrNotifyUser($pdo, qrFieldUserId($updated), $updated, 'quote_needs_info', 'More info needed: ' . $title, $note, $auth['user_id']);
            break;

        case 'approve':
            qrSnapshot($pdo, $updated, $auth, 'approved', $note !== '' ? mb_substr($note, 0, 255) : null);
            qrNotifyUser($pdo, qrFieldUserId($updated), $updated, 'quote_approved', 'Scope approved: ' . $title, null, $auth['user_id']);
            break;

        case 'accept':
            $granted = qrGrantRecipientsAccess($pdo, $updated);
            if ($granted) qrLogActivity($pdo, $id, $auth, 'portal_access', null, null, (string)$granted);
            qrNotifyUser($pdo, qrFieldUserId($updated), $updated, 'quote_accepted', 'Quote accepted: ' . $title, $updated['facility'], $auth['user_id']);
            if (!empty($updated['project_number'])) {
                notifyProjectStaff($pdo, $updated['project_number'], 'quote_accepted',
                    'Quote accepted: ' . $title, 'Estimate #' . ($updated['estimate_number'] ?? ''), '/projects/' . $updated['project_number']);
            }
            break;

        case 'decline':
            qrNotifyUser($pdo, qrFieldUserId($updated), $updated, 'quote_declined', 'Quote declined: ' . $title, $note, $auth['user_id']);
            break;
    }

    $pdo->commit();
    if ($action === 'accept' && !empty($updated['project_number'])) $acceptedProject = $updated['project_number'];
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
}

// Outside the transaction (it's a network call): make sure the project exists
// in Inventory — creating it there if the Estimate # is new — and mirror it
// into project_cache so it shows up for staff and in the client portal right
// away. Best-effort: a failure here doesn't undo the acceptance; the project
// still resolves the next time anyone opens it.
if ($acceptedProject !== null) {
    try {
        $result = inventoryResolveProject($auth['raw_token'], $acceptedProject);
        if ($result['status'] === 200 && !empty($result['data']['project_number'])) {
            $pdo->prepare(
                'INSERT INTO project_cache (project_number, name, client_name, client_address, updated_at)
                 VALUES (?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE name = VALUES(name), client_name = VALUES(client_name),
                     client_address = VALUES(client_address), updated_at = NOW()'
            )->execute([
                $result['data']['project_number'], $result['data']['name'],
                $result['data']['client_name'] ?? null, $result['data']['client_address'] ?? null,
            ]);
        }
    } catch (Throwable $e) { /* best-effort, see above */ }
}

echo json_encode(['message' => 'Done', 'status' => $updated['status']]);
