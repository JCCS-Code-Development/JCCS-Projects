<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/../services/weather_client.php';
require_once __DIR__ . '/../services/notify.php';

const UPLOAD_DIR       = __DIR__ . '/../uploads/daily-logs';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
];

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$scope  = pmProjectScope($auth); // null = admin, unrestricted

function fetchLogsWithExtras(PDO $pdo, string $sql, array $params): array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $logs = $stmt->fetchAll();
    if (!$logs) return [];

    $ids = array_column($logs, 'id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));

    $photoStmt = $pdo->prepare("SELECT id, daily_log_id, file_path FROM daily_log_photos WHERE daily_log_id IN ($placeholders) ORDER BY id");
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
    return $logs;
}

if ($method === 'GET') {
    $params = [];
    $sql = 'SELECT * FROM daily_logs';
    $where = [];
    if (!empty($_GET['project_number'])) {
        $where[] = 'project_number = ?';
        $params[] = $_GET['project_number'];
    }
    if ($scope !== null) {
        if (empty($scope)) { echo json_encode(['dailyLogs' => []]); exit; }
        $placeholders = implode(',', array_fill(0, count($scope), '?'));
        $where[] = "project_number IN ($placeholders)";
        $params = array_merge($params, $scope);
    }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY log_date DESC, id DESC LIMIT 100';

    echo json_encode(['dailyLogs' => fetchLogsWithExtras($pdo, $sql, $params)]);

} elseif ($method === 'POST') {
    // multipart/form-data, not JSON — photos are required at creation, so
    // this has always been a file upload, never a plain JSON write.
    $projectNumber = trim((string)($_POST['project_number'] ?? ''));
    $logDate       = trim((string)($_POST['log_date'] ?? ''));
    $workPerformed = trim((string)($_POST['work_performed'] ?? ''));

    if ($projectNumber === '' || $logDate === '' || $workPerformed === '') {
        http_response_code(422); exit(json_encode(['error' => 'Missing required field']));
    }
    if (!preg_match('/^\d{4}$/', $projectNumber)) {
        http_response_code(422); exit(json_encode(['error' => 'Estimate # must be exactly 4 digits']));
    }
    if ($scope !== null && !in_array($projectNumber, $scope, true)) {
        http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
    }

    // ── Validate photos BEFORE touching the DB or the filesystem ──────
    $files = $_FILES['photos'] ?? null;
    if (!$files || empty($files['name'][0])) {
        http_response_code(422); exit(json_encode(['error' => 'At least one photo is required']));
    }
    $count = count($files['name']);
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $validated = [];
    for ($i = 0; $i < $count; $i++) {
        if ($files['error'][$i] !== UPLOAD_ERR_OK) {
            http_response_code(422); exit(json_encode(['error' => 'One of the photos failed to upload']));
        }
        if ($files['size'][$i] > MAX_UPLOAD_BYTES) {
            http_response_code(422); exit(json_encode(['error' => 'Each photo must be 8MB or smaller']));
        }
        $mime = finfo_file($finfo, $files['tmp_name'][$i]);
        if (!isset(ALLOWED_MIME[$mime])) {
            http_response_code(422); exit(json_encode(['error' => 'Photos must be JPEG, PNG, or WebP']));
        }
        $validated[] = ['tmp_name' => $files['tmp_name'][$i], 'ext' => ALLOWED_MIME[$mime]];
    }

    if (!is_dir(UPLOAD_DIR)) { mkdir(UPLOAD_DIR, 0755, true); }

    $crewCount = isset($_POST['crew_count']) && $_POST['crew_count'] !== '' ? (int)$_POST['crew_count'] : null;
    $delays    = !empty($_POST['delays']) ? sanitizeString($_POST['delays']) : null;
    $notes     = !empty($_POST['notes']) ? sanitizeString($_POST['notes']) : null;

    // Best-effort, never blocks the write — see weather_client.php.
    $weather = getProjectWeather($pdo, $projectNumber);

    $phaseStmt = $pdo->prepare("SELECT id FROM phases WHERE project_number = ? AND status = 'current' LIMIT 1");
    $phaseStmt->execute([$projectNumber]);
    $phaseId = $phaseStmt->fetch()['id'] ?? null;

    $movedFiles = [];
    try {
        $pdo->beginTransaction();

        $pdo->prepare(
            'INSERT INTO daily_logs (project_number, log_date, weather, phase_id, crew_count, work_performed, delays, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $projectNumber, $logDate, $weather, $phaseId, $crewCount,
            sanitizeString($workPerformed), $delays, $notes, $auth['user_id'],
        ]);
        $logId = (int)$pdo->lastInsertId();

        $photoStmt = $pdo->prepare('INSERT INTO daily_log_photos (daily_log_id, file_path) VALUES (?, ?)');
        foreach ($validated as $file) {
            $filename = "{$logId}-" . bin2hex(random_bytes(6)) . ".{$file['ext']}";
            $dest = UPLOAD_DIR . '/' . $filename;
            if (!move_uploaded_file($file['tmp_name'], $dest)) {
                throw new RuntimeException('Could not save one of the photos');
            }
            $movedFiles[] = $dest;
            $photoStmt->execute([$logId, "daily-logs/{$filename}"]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        foreach ($movedFiles as $f) { @unlink($f); }
        http_response_code(500); exit(json_encode(['error' => 'Could not save the daily log']));
    }

    // Every staff-created daily log is "an update uploaded to the project" —
    // notify + email every client with access to it.
    notifyProjectClients(
        $pdo, $projectNumber, 'daily_log_created',
        "New daily log on project #{$projectNumber}",
        $workPerformed,
        "/portal/projects/{$projectNumber}?tab=daily-logs&log={$logId}"
    );

    echo json_encode(['id' => $logId, 'message' => 'Daily log saved']);

} else { http_response_code(405); }
