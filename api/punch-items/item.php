<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/../services/notify.php';

const STATUSES = ['open', 'ready_for_review', 'closed'];

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$scope  = pmProjectScope($auth);

if ($method !== 'PATCH') { http_response_code(405); exit; }

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

$stmt = $pdo->prepare('SELECT * FROM punch_items WHERE id = ?');
$stmt->execute([$id]);
$item = $stmt->fetch();
if (!$item) { http_response_code(404); exit(json_encode(['error' => 'Punch item not found'])); }
if ($scope !== null && !in_array($item['project_number'], $scope, true)) {
    http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
}

// Status moves are staff-only everywhere (no client verb exists at all —
// see portal/punch-items.php), which is enforced simply by this endpoint
// requiring requireAuth() rather than requireClientAuth().
$body = jsonBody();
requireFields($body, ['status']);
if (!in_array($body['status'], STATUSES, true)) {
    http_response_code(422); exit(json_encode(['error' => 'Invalid status']));
}

$sql = 'UPDATE punch_items SET status = ?';
$params = [$body['status']];

if ($body['status'] === 'closed' && $item['status'] !== 'closed') {
    $sql .= ', closed_by = ?, closed_by_name = ?, closed_at = NOW()';
    $params[] = $auth['user_id'];
    $params[] = $auth['name'];
} elseif ($body['status'] !== 'closed' && $item['status'] === 'closed') {
    // Reopening — clear the previous close-out record rather than leave a
    // stale "closed by/at" hanging off an item that's open again.
    $sql .= ', closed_by = NULL, closed_by_name = NULL, closed_at = NULL';
}

$sql .= ' WHERE id = ?';
$params[] = $id;
$pdo->prepare($sql)->execute($params);

$statusLabels = ['open' => 'Open', 'ready_for_review' => 'Ready for Review', 'closed' => 'Closed'];
notifyProjectClients(
    $pdo, $item['project_number'], 'punch_item_status_changed',
    "Punch item updated — project #{$item['project_number']}",
    "{$item['title']}: now {$statusLabels[$body['status']]}",
    "/portal/projects/{$item['project_number']}?tab=punch-list&item={$id}"
);

echo json_encode(['message' => 'Punch item updated']);
