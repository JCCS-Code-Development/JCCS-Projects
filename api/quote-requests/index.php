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

$auth   = requireAuth(QR_ROLES);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    // List view — the heavy columns (form, scope) are left out; the detail
    // endpoint returns those.
    $sql = "SELECT q.id, q.status, q.work_type, q.estimate_type, q.title, q.facility, q.location_detail,
                   q.project_number, q.estimate_number, q.priority, q.needed_by, q.site_visit_date, q.site_visit_at,
                   q.field_manager_id, q.field_manager_name, q.assigned_to, q.assigned_to_name,
                   q.customer_id, c.name AS customer_name, q.follow_up_days, q.decline_reason,
                   q.created_by, q.created_by_name, q.submitted_at, q.approved_at, q.sent_at, q.decided_at,
                   q.created_at, q.updated_at,
                   (SELECT COUNT(*) FROM quote_request_photos p WHERE p.quote_request_id = q.id) AS photo_count,
                   (SELECT p2.file_path FROM quote_request_photos p2 WHERE p2.quote_request_id = q.id ORDER BY p2.id LIMIT 1) AS cover_path,
                   (SELECT c2.kind FROM quote_request_comments c2 WHERE c2.quote_request_id = q.id ORDER BY c2.id DESC LIMIT 1) AS last_comment_kind
            FROM quote_requests q
            LEFT JOIN customers c ON c.id = q.customer_id";
    $where = []; $params = [];

    if (!qrIsAdmin($auth)) {
        $where[] = '(q.created_by = ? OR q.field_manager_id = ?)';
        $params[] = $auth['user_id']; $params[] = $auth['user_id'];
    }
    if (!empty($_GET['status'])) {
        $statuses = array_values(array_intersect(explode(',', (string)$_GET['status']), QR_STATUSES));
        if ($statuses) {
            $where[] = 'q.status IN (' . implode(',', array_fill(0, count($statuses), '?')) . ')';
            $params = array_merge($params, $statuses);
        }
    }
    if (!empty($_GET['project_number']) && preg_match('/^\d{4}$/', (string)$_GET['project_number'])) {
        $where[] = 'q.project_number = ?'; $params[] = $_GET['project_number'];
    }
    if (!empty($_GET['assigned_to'])) {
        $where[] = 'q.assigned_to = ?'; $params[] = (int)$_GET['assigned_to'];
    }
    if (!empty($_GET['customer_id'])) {
        $where[] = 'q.customer_id = ?'; $params[] = (int)$_GET['customer_id'];
    }
    if (isset($_GET['q']) && trim((string)$_GET['q']) !== '') {
        $q = '%' . trim((string)$_GET['q']) . '%';
        $where[] = '(q.title LIKE ? OR q.facility LIKE ? OR c.name LIKE ? OR q.estimate_number LIKE ? OR q.project_number LIKE ?)';
        array_push($params, $q, $q, $q, $q, $q);
    }
    // Closed requests (accepted/declined/cancelled) only when asked for, so
    // the board stays focused on open work.
    if (empty($_GET['status']) && empty($_GET['include_closed'])) {
        $where[] = "q.status NOT IN ('accepted','declined','cancelled')";
    }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY q.updated_at DESC LIMIT 500';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = array_map(function ($r) use ($auth) {
        $r['form_json'] = null;
        $out = qrPresent($r, $auth);
        $out['photo_count'] = (int)$r['photo_count'];
        $out['cover_url'] = $r['cover_path'] ? qrFileUrl($r['cover_path']) : null;
        unset($out['cover_path']);
        unset($out['form']);
        return $out;
    }, $stmt->fetchAll());

    echo json_encode(['quoteRequests' => $rows]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['title']);

    $sets = []; $params = [];
    qrCollectFields($pdo, $body, $auth, $sets, $params);

    // A field manager's own walk is theirs by default; an admin logging a
    // phone/email request can hand it to a field manager (or keep it).
    if (!qrIsAdmin($auth)) {
        $sets[] = 'field_manager_id = ?';   $params[] = $auth['user_id'];
        $sets[] = 'field_manager_name = ?'; $params[] = $auth['name'];
    }
    // work_type addon ⇒ default estimate_type addon unless given.
    if (($body['work_type'] ?? null) === 'addon' && !array_key_exists('estimate_type', $body)) {
        $sets[] = 'estimate_type = ?'; $params[] = 'addon';
    }
    $sets[] = 'created_by = ?';      $params[] = $auth['user_id'];
    $sets[] = 'created_by_name = ?'; $params[] = $auth['name'];

    $cols = array_map(fn($s) => substr($s, 0, strpos($s, ' ')), $sets);
    $pdo->prepare('INSERT INTO quote_requests (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')')
        ->execute($params);
    $id = (int)$pdo->lastInsertId();

    $row = qrLoadVisible($pdo, $auth, $id);
    qrLogActivity($pdo, $id, $auth, 'created', null, 'draft');

    // Admin handed it to someone else to walk → tell them.
    if (qrIsAdmin($auth) && !empty($row['field_manager_id'])) {
        qrNotifyUser($pdo, (int)$row['field_manager_id'], $row, 'quote_assigned_field',
            'Site walk assigned: ' . $row['title'], $row['facility'], $auth['user_id']);
    }

    echo json_encode(['id' => $id, 'request_no' => qrRequestNo($id), 'message' => 'Quote request created']);

} else { http_response_code(405); }
