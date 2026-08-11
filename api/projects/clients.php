<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Read-only — which client-portal accounts can see this project. Assigning
// / revoking access is a job for the (still-placeholder) Users admin page;
// this endpoint just answers "who's assigned" for the project header.
$auth = requireAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

requireFields($_GET, ['project_number']);
$projectNumber = trim((string)$_GET['project_number']);

$scope = pmProjectScope($auth);
if ($scope !== null && !in_array($projectNumber, $scope, true)) {
    http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
}

$pdo  = getPDO();
$stmt = $pdo->prepare(
    'SELECT c.id, c.name, c.email FROM clients c
     JOIN client_project_access cpa ON cpa.client_id = c.id
     WHERE cpa.project_number = ? AND c.is_active = 1
     ORDER BY c.name'
);
$stmt->execute([$projectNumber]);
echo json_encode(['clients' => $stmt->fetchAll()]);
