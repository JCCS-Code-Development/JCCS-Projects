<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$scope  = pmProjectScope($auth);

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

$stmt = $pdo->prepare('SELECT * FROM phases WHERE id = ?');
$stmt->execute([$id]);
$phase = $stmt->fetch();
if (!$phase) { http_response_code(404); exit(json_encode(['error' => 'Phase not found'])); }

if ($scope !== null && !in_array($phase['project_number'], $scope, true)) {
    http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
}

if ($method === 'PUT') {
    $body = jsonBody();
    $name      = isset($body['name']) ? sanitizeString($body['name']) : $phase['name'];
    $scope     = array_key_exists('scope', $body) ? (($body['scope'] !== '' && $body['scope'] !== null) ? sanitizeString($body['scope']) : null) : $phase['scope'];
    $sequence  = isset($body['sequence']) ? (int)$body['sequence'] : $phase['sequence'];
    $status    = in_array($body['status'] ?? null, ['upcoming', 'current', 'completed'], true) ? $body['status'] : $phase['status'];
    $startDate = array_key_exists('start_date', $body) ? ($body['start_date'] ?: null) : $phase['start_date'];
    $endDate   = array_key_exists('end_date', $body) ? ($body['end_date'] ?: null) : $phase['end_date'];

    // Only one 'current' phase per project — setting this one current
    // demotes whatever else was current to 'completed' (the natural
    // "moving on to the next phase" transition).
    if ($status === 'current' && $phase['status'] !== 'current') {
        $pdo->prepare("UPDATE phases SET status = 'completed' WHERE project_number = ? AND status = 'current' AND id != ?")
            ->execute([$phase['project_number'], $id]);
    }

    $pdo->prepare('UPDATE phases SET name = ?, scope = ?, sequence = ?, status = ?, start_date = ?, end_date = ? WHERE id = ?')
        ->execute([$name, $scope, $sequence, $status, $startDate, $endDate, $id]);
    echo json_encode(['message' => 'Phase updated']);

} elseif ($method === 'DELETE') {
    $pdo->prepare('DELETE FROM phases WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Phase deleted']);

} else { http_response_code(405); }
