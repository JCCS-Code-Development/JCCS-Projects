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
$scope  = pmProjectScope($auth); // null = admin, unrestricted

function assertProjectAccess(?array $scope, string $projectNumber): void {
    if ($scope !== null && !in_array($projectNumber, $scope, true)) {
        http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
    }
}

if ($method === 'GET') {
    requireFields($_GET, ['project_number']);
    $projectNumber = trim((string)$_GET['project_number']);
    assertProjectAccess($scope, $projectNumber);

    $stmt = $pdo->prepare('SELECT * FROM phases WHERE project_number = ? ORDER BY sequence, id');
    $stmt->execute([$projectNumber]);
    echo json_encode(['phases' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['project_number', 'name']);
    $projectNumber = trim((string)$body['project_number']);
    if (!preg_match('/^\d{4}$/', $projectNumber)) {
        http_response_code(422); exit(json_encode(['error' => 'Estimate # must be exactly 4 digits']));
    }
    assertProjectAccess($scope, $projectNumber);

    // New phases append to the end unless a sequence is given explicitly.
    $sequence = $body['sequence'] ?? null;
    if ($sequence === null) {
        $stmt = $pdo->prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS next_seq FROM phases WHERE project_number = ?');
        $stmt->execute([$projectNumber]);
        $sequence = (int)$stmt->fetch()['next_seq'];
    }

    $statusInput = $body['status'] ?? 'upcoming';
    $status = in_array($statusInput, ['upcoming', 'current', 'completed'], true) ? $statusInput : 'upcoming';
    if ($status === 'current') {
        $pdo->prepare("UPDATE phases SET status = 'completed' WHERE project_number = ? AND status = 'current'")
            ->execute([$projectNumber]);
    }

    $pdo->prepare(
        'INSERT INTO phases (project_number, name, scope, sequence, status, start_date, end_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $projectNumber,
        sanitizeString($body['name']),
        !empty($body['scope']) ? sanitizeString($body['scope']) : null,
        $sequence,
        $status,
        !empty($body['start_date']) ? $body['start_date'] : null,
        !empty($body['end_date']) ? $body['end_date'] : null,
        $auth['user_id'],
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Phase created']);

} else { http_response_code(405); }
