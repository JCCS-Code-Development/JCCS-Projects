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


// Reference documents on a request: plans, sketches, product data, finish
// selections, client emails, ICRA requirements, existing estimates...
const QR_FILE_KINDS = ['plan', 'sketch', 'product_data', 'finish_selection', 'client_email', 'engineering', 'icra', 'existing_estimate', 'manufacturer_instructions', 'other'];
const QR_FILE_MIME = [
    'application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/heic' => 'heic',
    'application/msword' => 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
    'application/vnd.ms-excel' => 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
    'text/plain' => 'txt', 'message/rfc822' => 'eml', 'application/vnd.ms-outlook' => 'msg', 'application/CDFV2' => 'msg',
];
const QR_FILE_MAX = 40 * 1024 * 1024;

$auth   = requireAuth(QR_ROLES);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

function qrFilesEditable(array $auth, array $row): bool {
    return qrIsAdmin($auth) ? $row['status'] !== 'cancelled' : qrFieldCanEdit($auth, $row);
}

if ($method === 'POST') {
    $requestId = (int)($_POST['quote_request_id'] ?? 0);
    if (!$requestId) { http_response_code(422); exit(json_encode(['error' => 'Missing quote_request_id'])); }
    $row = qrLoadVisible($pdo, $auth, $requestId);
    if (!qrFilesEditable($auth, $row)) { http_response_code(409); exit(json_encode(['error' => 'Files can no longer be added to this request'])); }

    $kind = (string)($_POST['kind'] ?? 'other');
    if (!in_array($kind, QR_FILE_KINDS, true)) $kind = 'other';

    [$tmp, $ext, $original] = qrAcceptUpload(QR_FILE_MIME, QR_FILE_MAX);
    $path = qrStoreUpload($requestId, $tmp, $ext);
    $pdo->prepare('INSERT INTO quote_request_files (quote_request_id, kind, file_path, original_filename, uploaded_by, uploaded_by_name) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$requestId, $kind, $path, $original, $auth['user_id'], $auth['name']]);

    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'url' => qrFileUrl($path)]);

} elseif ($method === 'DELETE') {
    $fileId = (int)($_GET['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM quote_request_files WHERE id = ?');
    $s->execute([$fileId]);
    $file = $s->fetch();
    if (!$file) { http_response_code(404); exit(json_encode(['error' => 'File not found'])); }
    $row = qrLoadVisible($pdo, $auth, (int)$file['quote_request_id']);
    if (!qrFilesEditable($auth, $row)) { http_response_code(409); exit(json_encode(['error' => 'Files on this request can no longer be changed'])); }

    $pdo->prepare('DELETE FROM quote_request_files WHERE id = ?')->execute([$fileId]);
    @unlink(__DIR__ . '/../uploads/' . $file['file_path']);
    echo json_encode(['message' => 'Deleted']);

} else { http_response_code(405); }
