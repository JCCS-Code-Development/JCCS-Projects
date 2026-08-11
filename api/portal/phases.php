<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Read-only — lets the client portal show the same phase progress the staff
// project view shows, scoped strictly to client_project_access. No
// create/update/delete verb exists here at all; phase management stays a
// staff-only capability (PhasesManagerModal is never reachable from here).
$auth = requireClientAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

requireFields($_GET, ['project_number']);
$projectNumber = trim((string)$_GET['project_number']);
if (!in_array($projectNumber, $auth['projects'], true)) {
    http_response_code(404); exit(json_encode(['error' => 'Project not found']));
}

$pdo  = getPDO();
$stmt = $pdo->prepare('SELECT id, name, sequence, status, start_date, end_date, updated_at, created_at FROM phases WHERE project_number = ? ORDER BY sequence, id');
$stmt->execute([$projectNumber]);
echo json_encode(['phases' => $stmt->fetchAll()]);
