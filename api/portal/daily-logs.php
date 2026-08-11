<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Read-only, scoped strictly to client_project_access — a client can never
// see a daily log for a project_number outside their own grant list, and
// there is no POST/PUT/DELETE verb on this endpoint at all.
$auth = requireClientAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

if (empty($auth['projects'])) { echo json_encode(['dailyLogs' => []]); exit; }

$pdo = getPDO();

// Single-log fetch (?id=) — the notification deep-link target. Scoped the
// same way as the list: the log's own project_number must be in this
// client's grant list.
if (!empty($_GET['id'])) {
    $stmt = $pdo->prepare('SELECT * FROM daily_logs WHERE id = ?');
    $stmt->execute([(int)$_GET['id']]);
    $log = $stmt->fetch();
    if (!$log || !in_array($log['project_number'], $auth['projects'], true)) {
        http_response_code(404); exit(json_encode(['error' => 'Daily log not found']));
    }
    $stmt = $pdo->prepare('SELECT id, file_path FROM daily_log_photos WHERE daily_log_id = ? ORDER BY id');
    $stmt->execute([$log['id']]);
    $log['photos'] = array_map(
        fn($p) => ['id' => (int)$p['id'], 'url' => APP_URL . '/uploads/' . $p['file_path']],
        $stmt->fetchAll()
    );
    $log['phase_name'] = null;
    $log['phase_sequence'] = null;
    if ($log['phase_id']) {
        $phStmt = $pdo->prepare('SELECT name, sequence FROM phases WHERE id = ?');
        $phStmt->execute([$log['phase_id']]);
        $phase = $phStmt->fetch();
        $log['phase_name']     = $phase['name'] ?? null;
        $log['phase_sequence'] = $phase['sequence'] ?? null;
    }
    echo json_encode(['dailyLog' => $log]);
    exit;
}

// Optional ?project_number filter for viewing one project's tab — still
// constrained to the client's own grant list either way (a project_number
// outside client_project_access simply can't match the IN (...) clause).
$projects = $auth['projects'];
if (!empty($_GET['project_number'])) {
    $projects = in_array($_GET['project_number'], $auth['projects'], true) ? [$_GET['project_number']] : [];
}
if (empty($projects)) { echo json_encode(['dailyLogs' => []]); exit; }

$placeholders = implode(',', array_fill(0, count($projects), '?'));
$stmt = $pdo->prepare(
    "SELECT id, project_number, log_date, weather, phase_id, crew_count, work_performed, delays, created_at
     FROM daily_logs WHERE project_number IN ($placeholders) ORDER BY log_date DESC, id DESC LIMIT 100"
);
$stmt->execute($projects);
$logs = $stmt->fetchAll();

if ($logs) {
    $ids = array_column($logs, 'id');
    $idPlaceholders = implode(',', array_fill(0, count($ids), '?'));
    $photoStmt = $pdo->prepare("SELECT id, daily_log_id, file_path FROM daily_log_photos WHERE daily_log_id IN ($idPlaceholders) ORDER BY id");
    $photoStmt->execute($ids);
    $photosByLog = [];
    foreach ($photoStmt->fetchAll() as $p) {
        $photosByLog[$p['daily_log_id']][] = ['id' => (int)$p['id'], 'url' => APP_URL . '/uploads/' . $p['file_path']];
    }

    $phaseIds = array_values(array_filter(array_unique(array_column($logs, 'phase_id'))));
    $phases = [];
    if ($phaseIds) {
        $phPlaceholders = implode(',', array_fill(0, count($phaseIds), '?'));
        $phStmt = $pdo->prepare("SELECT id, name, sequence FROM phases WHERE id IN ($phPlaceholders)");
        $phStmt->execute($phaseIds);
        foreach ($phStmt->fetchAll() as $ph) { $phases[$ph['id']] = $ph; }
    }

    foreach ($logs as &$log) {
        $log['photos']         = $photosByLog[$log['id']] ?? [];
        $log['phase_name']     = $log['phase_id'] ? ($phases[$log['phase_id']]['name'] ?? null) : null;
        $log['phase_sequence'] = $log['phase_id'] ? ($phases[$log['phase_id']]['sequence'] ?? null) : null;
    }
}

echo json_encode(['dailyLogs' => $logs]);
