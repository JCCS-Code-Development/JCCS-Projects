<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Daily-log photos are append-only (a field report can carry several
// photos), unlike Inventory's single-slot order attachments — so this only
// ever adds, never replaces.
const UPLOAD_DIR       = __DIR__ . '/../uploads/daily-logs';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
];

$auth = requireAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$dailyLogId = isset($_POST['daily_log_id']) ? (int)$_POST['daily_log_id'] : 0;
if (!$dailyLogId) { http_response_code(422); exit(json_encode(['error' => 'Missing daily_log_id'])); }

$pdo  = getPDO();
$stmt = $pdo->prepare('SELECT * FROM daily_logs WHERE id = ?');
$stmt->execute([$dailyLogId]);
$log = $stmt->fetch();
if (!$log) { http_response_code(404); exit(json_encode(['error' => 'Daily log not found'])); }

$scope = pmProjectScope($auth);
if ($scope !== null && !in_array($log['project_number'], $scope, true)) {
    http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
}

if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(422); exit(json_encode(['error' => 'No file uploaded']));
}
$file = $_FILES['file'];
if ($file['size'] > MAX_UPLOAD_BYTES) {
    http_response_code(422); exit(json_encode(['error' => 'File is too large (8MB max)']));
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime  = finfo_file($finfo, $file['tmp_name']);
if (!isset(ALLOWED_MIME[$mime])) {
    http_response_code(422); exit(json_encode(['error' => 'File must be a JPEG/PNG/WebP photo']));
}
$ext = ALLOWED_MIME[$mime];

if (!is_dir(UPLOAD_DIR)) { mkdir(UPLOAD_DIR, 0755, true); }

$filename = "{$dailyLogId}-" . bin2hex(random_bytes(6)) . ".{$ext}";
if (!move_uploaded_file($file['tmp_name'], UPLOAD_DIR . '/' . $filename)) {
    http_response_code(500); exit(json_encode(['error' => 'Could not save the file']));
}

$relativePath = "daily-logs/{$filename}";
$pdo->prepare('INSERT INTO daily_log_photos (daily_log_id, file_path) VALUES (?, ?)')
    ->execute([$dailyLogId, $relativePath]);

echo json_encode(['id' => (int)$pdo->lastInsertId(), 'url' => APP_URL . '/uploads/' . $relativePath]);
