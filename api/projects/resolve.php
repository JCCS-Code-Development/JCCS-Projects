<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/../services/inventory_client.php';

$auth = requireAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body = jsonBody();
requireFields($body, ['project_number']);
$projectNumber = trim((string)$body['project_number']);
if (!preg_match('/^\d{4}$/', $projectNumber)) {
    http_response_code(422); exit(json_encode(['error' => 'Estimate # must be exactly 4 digits']));
}

// Inventory's own resolve.php has no PM-scope concept and will silently
// CREATE a bare project for any number it doesn't recognize — so unlike
// admins, a PM must stay within pm_project_access here too, or they could
// both view AND conjure projects outside their assignment via this form.
$scope = pmProjectScope($auth);
if ($scope !== null && !in_array($projectNumber, $scope, true)) {
    http_response_code(403);
    exit(json_encode(['error' => 'Not assigned to this project']));
}

$result = inventoryResolveProject($auth['raw_token'], $projectNumber);

if ($result['status'] === 200 && !empty($result['data']['project_number'])) {
    $pdo = getPDO();
    $pdo->prepare(
        'INSERT INTO project_cache (project_number, name, client_name, client_address, updated_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE name = VALUES(name), client_name = VALUES(client_name),
             client_address = VALUES(client_address), updated_at = NOW()'
    )->execute([
        $result['data']['project_number'],
        $result['data']['name'],
        $result['data']['client_name'] ?? null,
        $result['data']['client_address'] ?? null,
    ]);
}

http_response_code($result['status']);
echo json_encode($result['data']);
