<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

$auth = requireAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

$pdo  = getPDO();
$stmt = $pdo->prepare('SELECT * FROM daily_logs WHERE id = ?');
$stmt->execute([$id]);
$log = $stmt->fetch();
if (!$log) { http_response_code(404); exit(json_encode(['error' => 'Daily log not found'])); }

$scope = pmProjectScope($auth);
if ($scope !== null && !in_array($log['project_number'], $scope, true)) {
    http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
}

$stmt = $pdo->prepare('SELECT id, file_path FROM daily_log_photos WHERE daily_log_id = ? ORDER BY id');
$stmt->execute([$id]);
$log['photos'] = array_map(
    fn($p) => ['id' => (int)$p['id'], 'url' => APP_URL . '/uploads/' . $p['file_path']],
    $stmt->fetchAll()
);

$log['phase_name'] = null;
$log['phase_sequence'] = null;
if ($log['phase_id']) {
    $stmt = $pdo->prepare('SELECT name, sequence FROM phases WHERE id = ?');
    $stmt->execute([$log['phase_id']]);
    $phase = $stmt->fetch();
    $log['phase_name']     = $phase['name'] ?? null;
    $log['phase_sequence'] = $phase['sequence'] ?? null;
}

echo json_encode($log);
