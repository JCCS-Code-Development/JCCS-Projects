<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Clients have no FieldClock identity, so this can't proxy to Inventory
// live — it reads the local project_cache table instead, kept warm by
// staff reads in projects/index.php and projects/resolve.php.
$auth = requireClientAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

if (empty($auth['projects'])) { echo json_encode(['projects' => []]); exit; }

// Optional single-project lookup (?project_number=) for the Project Detail
// tabs — still constrained to client_project_access via the IN (...) below.
if (!empty($_GET['project_number'])) {
    if (!in_array($_GET['project_number'], $auth['projects'], true)) {
        http_response_code(404); exit(json_encode(['error' => 'Project not found']));
    }
    $pdo  = getPDO();
    $stmt = $pdo->prepare('SELECT * FROM project_cache WHERE project_number = ?');
    $stmt->execute([$_GET['project_number']]);
    $project = $stmt->fetch();
    if (!$project) { http_response_code(404); exit(json_encode(['error' => 'Project not found'])); }
    echo json_encode(['project' => $project]);
    exit;
}

$pdo          = getPDO();
$placeholders = implode(',', array_fill(0, count($auth['projects']), '?'));
$stmt = $pdo->prepare("SELECT * FROM project_cache WHERE project_number IN ($placeholders) ORDER BY name");
$stmt->execute($auth['projects']);
echo json_encode(['projects' => $stmt->fetchAll()]);
