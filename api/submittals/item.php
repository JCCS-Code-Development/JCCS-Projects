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

const STATUSES = ['pending', 'approved', 'approved_as_noted', 'revise_resubmit', 'rejected'];

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$scope  = pmProjectScope($auth);

if ($method !== 'PATCH') { http_response_code(405); exit; }

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

$stmt = $pdo->prepare('SELECT * FROM submittals WHERE id = ?');
$stmt->execute([$id]);
$submittal = $stmt->fetch();
if (!$submittal) { http_response_code(404); exit(json_encode(['error' => 'Submittal not found'])); }
if ($scope !== null && !in_array($submittal['project_number'], $scope, true)) {
    http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
}

$body = jsonBody();
requireFields($body, ['status']);
if (!in_array($body['status'], STATUSES, true)) {
    http_response_code(422); exit(json_encode(['error' => 'Invalid status']));
}

$pdo->prepare(
    'UPDATE submittals SET status = ?, reviewed_by = ?, reviewed_by_name = ?, reviewed_at = NOW() WHERE id = ?'
)->execute([$body['status'], $auth['user_id'], $auth['name'], $id]);

$statusLabels = [
    'pending'            => 'Pending',
    'approved'           => 'Approved',
    'approved_as_noted'  => 'Approved as Noted',
    'revise_resubmit'    => 'Revise & Resubmit',
    'rejected'           => 'Rejected',
];
notifyProjectClients(
    $pdo, $submittal['project_number'], 'submittal_status_changed',
    "Submittal #{$submittal['submittal_number']} updated — project #{$submittal['project_number']}",
    "{$submittal['title']}: now {$statusLabels[$body['status']]}",
    "/portal/projects/{$submittal['project_number']}?tab=submittals&submittal={$id}"
);

echo json_encode(['message' => 'Submittal updated']);
