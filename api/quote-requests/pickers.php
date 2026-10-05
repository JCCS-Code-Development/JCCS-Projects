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


// Lightweight pickers for the request form, readable by field managers (who
// are otherwise locked out of /projects/* and /users/*):
//   ?kind=projects — active projects from project_cache, for add-on requests
//   ?kind=staff    — active field managers + admins, for assignment
$auth = requireAuth(QR_ROLES);
$pdo  = getPDO();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$kind = $_GET['kind'] ?? '';
if ($kind === 'projects') {
    $rows = $pdo->query("SELECT project_number, name, client_name FROM project_cache WHERE project_number <> '0000' AND is_active = 1 ORDER BY name")->fetchAll();
    echo json_encode(['projects' => $rows]);
} elseif ($kind === 'staff') {
    $rows = $pdo->query("SELECT fieldclock_user_id AS id, name, role FROM projects_staff_roles WHERE is_active = 1 AND role IN ('field','admin') ORDER BY name")->fetchAll();
    echo json_encode(['staff' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name'], 'role' => $r['role']], $rows)]);
} else {
    http_response_code(422); echo json_encode(['error' => 'Unknown picker']);
}
