<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Staff-only — adding an 'after' proof photo (or another 'before' angle) to
// an existing punch item. The initial creation already required at least
// one 'before' photo; this is for anything added afterward.
const UPLOAD_DIR       = __DIR__ . '/../uploads/punch-items';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
];

$auth   = requireAuth();
$pdo    = getPDO();
$scope  = pmProjectScope($auth);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$itemId = isset($_POST['punch_item_id']) ? (int)$_POST['punch_item_id'] : 0;
$phase  = in_array($_POST['phase'] ?? null, ['before', 'after'], true) ? $_POST['phase'] : 'after';
if (!$itemId) { http_response_code(422); exit(json_encode(['error' => 'Missing punch_item_id'])); }

$stmt = $pdo->prepare('SELECT * FROM punch_items WHERE id = ?');
$stmt->execute([$itemId]);
$item = $stmt->fetch();
if (!$item) { http_response_code(404); exit(json_encode(['error' => 'Punch item not found'])); }
if ($scope !== null && !in_array($item['project_number'], $scope, true)) {
    http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
}

$file = $_FILES['photo'] ?? null;
if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(422); exit(json_encode(['error' => 'A photo is required']));
}
if ($file['size'] > MAX_UPLOAD_BYTES) {
    http_response_code(422); exit(json_encode(['error' => 'Photo must be 8MB or smaller']));
}
$mime = finfo_file(finfo_open(FILEINFO_MIME_TYPE), $file['tmp_name']);
if (!isset(ALLOWED_MIME[$mime])) {
    http_response_code(422); exit(json_encode(['error' => 'Photo must be JPEG, PNG, or WebP']));
}

if (!is_dir(UPLOAD_DIR)) { mkdir(UPLOAD_DIR, 0755, true); }

$filename = "{$itemId}-" . bin2hex(random_bytes(6)) . "." . ALLOWED_MIME[$mime];
$dest = UPLOAD_DIR . '/' . $filename;
if (!move_uploaded_file($file['tmp_name'], $dest)) {
    http_response_code(500); exit(json_encode(['error' => 'Could not save the photo']));
}

$pdo->prepare(
    'INSERT INTO punch_item_photos (punch_item_id, phase, file_path, uploaded_by_type, uploaded_by_name) VALUES (?, ?, ?, ?, ?)'
)->execute([$itemId, $phase, "punch-items/{$filename}", 'staff', $auth['name']]);

echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Photo added']);
