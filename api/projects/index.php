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

// Thin same-origin proxy — the frontend only ever talks to this domain.
// Projects has no local `projects` table; jccs-inventory's is the one
// source of truth. See services/inventory_client.php for why this is a
// server-to-server call rather than a browser cross-origin request.
$auth = requireAuth();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Full project creation (name + client fields), admin-only on this side —
    // resolve.php already covers the "bare project from a 4-digit number"
    // case for everyone. Inventory ALSO gates its own POST /projects to its
    // own admins, so this can still 403 downstream if the signed-in person
    // isn't an Inventory admin too; that error is passed through as-is.
    requireAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['name', 'project_number']);

    $projectNumber = trim((string)$body['project_number']);
    if (!preg_match('/^\d{4}$/', $projectNumber)) {
        http_response_code(422); exit(json_encode(['error' => 'Estimate # must be exactly 4 digits']));
    }

    $result = inventoryCreateProject($auth['raw_token'], [
        'name'            => sanitizeString($body['name']),
        'project_number'  => $projectNumber,
        'client_name'     => !empty($body['client_name']) ? sanitizeString($body['client_name']) : null,
        'client_address'  => !empty($body['client_address']) ? sanitizeString($body['client_address']) : null,
    ]);

    if ($result['status'] === 200 || $result['status'] === 201) {
        $pdo = getPDO();
        $pdo->prepare(
            'INSERT INTO project_cache (project_number, name, client_name, client_address, updated_at)
             VALUES (?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE name = VALUES(name), client_name = VALUES(client_name),
                 client_address = VALUES(client_address), updated_at = NOW()'
        )->execute([$projectNumber, $body['name'], $body['client_name'] ?? null, $body['client_address'] ?? null]);
    }

    http_response_code($result['status']);
    echo json_encode($result['data']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$pdo    = getPDO();
$result = inventoryListProjects($auth['raw_token']);

// Cache name/client fields locally so the client portal (which has no
// FieldClock identity to call Inventory with) can still show project info
// without a live proxy call. Refreshed opportunistically on every staff read.
if ($result['status'] === 200 && !empty($result['data']['projects'])) {
    cacheProjects($pdo, $result['data']['projects']);
}

// PMs only see projects they've been scoped to; admins see everything
// Inventory returns.
$scope = pmProjectScope($auth);
if ($scope !== null && isset($result['data']['projects'])) {
    $result['data']['projects'] = array_values(array_filter(
        $result['data']['projects'],
        fn($p) => in_array($p['project_number'], $scope, true)
    ));
}

// Optional single-project lookup (?project_number=), used by the Project
// Detail page. Deliberately filtered from the SAME scope-checked list above
// rather than proxying straight to Inventory's resolve.php — that endpoint
// has no PM-scope check and will silently CREATE a bare project for any
// number it doesn't recognize, which would let a PM view (and conjure)
// projects outside pm_project_access just by guessing a URL.
if (!empty($_GET['project_number']) && isset($result['data']['projects'])) {
    $match = null;
    foreach ($result['data']['projects'] as $p) {
        if ($p['project_number'] === $_GET['project_number']) { $match = $p; break; }
    }
    if (!$match) {
        http_response_code(404);
        echo json_encode(['error' => 'Project not found']);
        exit;
    }
    http_response_code(200);
    echo json_encode(['project' => $match]);
    exit;
}

http_response_code($result['status']);
echo json_encode($result['data']);

function cacheProjects(PDO $pdo, array $projects): void {
    $stmt = $pdo->prepare(
        'INSERT INTO project_cache (project_number, name, client_name, client_address, is_active, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE name = VALUES(name), client_name = VALUES(client_name),
             client_address = VALUES(client_address), is_active = VALUES(is_active),
             status = VALUES(status), updated_at = NOW()'
    );
    foreach ($projects as $p) {
        $stmt->execute([
            $p['project_number'], $p['name'], $p['client_name'] ?? null, $p['client_address'] ?? null,
            array_key_exists('is_active', $p) ? (int)$p['is_active'] : 1,
            $p['status'] ?? 'active',
        ]);
    }
}
