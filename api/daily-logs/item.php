<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// GET  — one daily log with its photos + phase (used by the deep-linked
//        detail page); any staff member scoped to the project.
// DELETE — permanently remove the log, its photos (rows + files) and its
//        comment thread. Irreversible; admins only.
$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$scope  = pmProjectScope($auth); // null = admin (unrestricted)

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

$stmt = $pdo->prepare('SELECT * FROM daily_logs WHERE id = ?');
$stmt->execute([$id]);
$log = $stmt->fetch();
if (!$log) { http_response_code(404); exit(json_encode(['error' => 'Daily log not found'])); }
if ($scope !== null && !in_array($log['project_number'], $scope, true)) {
    http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
}

if ($method === 'GET') {
    $photoStmt = $pdo->prepare('SELECT id, file_path FROM daily_log_photos WHERE daily_log_id = ? ORDER BY id');
    $photoStmt->execute([$id]);
    $log['photos'] = array_map(
        fn ($p) => ['id' => (int) $p['id'], 'url' => APP_URL . '/uploads/' . $p['file_path']],
        $photoStmt->fetchAll()
    );

    $log['phase_name'] = null;
    $log['phase_sequence'] = null;
    if ($log['phase_id']) {
        $ph = $pdo->prepare('SELECT name, sequence FROM phases WHERE id = ?');
        $ph->execute([$log['phase_id']]);
        if ($row = $ph->fetch()) {
            $log['phase_name'] = $row['name'];
            $log['phase_sequence'] = $row['sequence'];
        }
    }

    echo json_encode($log); // returned as-is (the detail page consumes it directly)
    exit;
}

if ($method === 'DELETE') {
    requireAdmin($auth);

    $photoStmt = $pdo->prepare('SELECT file_path FROM daily_log_photos WHERE daily_log_id = ?');
    $photoStmt->execute([$id]);
    $files = array_column($photoStmt->fetchAll(), 'file_path');

    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM daily_log_comments WHERE daily_log_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM daily_log_photos   WHERE daily_log_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM daily_logs         WHERE id = ?')->execute([$id]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        http_response_code(500); exit(json_encode(['error' => 'Could not delete the daily log']));
    }

    // Files last — a leftover file is harmless, a missing DB row is not.
    $base = realpath(__DIR__ . '/../uploads');
    foreach ($files as $rel) {
        $path = realpath(__DIR__ . '/../uploads/' . $rel);
        if ($path && $base && str_starts_with($path, $base . DIRECTORY_SEPARATOR)) {
            @unlink($path);
        }
    }

    echo json_encode(['message' => 'Daily log permanently deleted']);
    exit;
}

http_response_code(405);
