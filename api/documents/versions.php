<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/../services/notify.php';

const UPLOAD_DIR       = __DIR__ . '/../uploads/documents';
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // raised from 25MB to accommodate video walkthroughs
const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx', 'dwg', 'dxf', 'mp4', 'mov', 'webm'];

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$scope  = pmProjectScope($auth);

function loadDocument(PDO $pdo, int $docId): ?array {
    $stmt = $pdo->prepare('SELECT * FROM documents WHERE id = ? AND is_active = 1');
    $stmt->execute([$docId]);
    $doc = $stmt->fetch();
    return $doc ?: null;
}

if ($method === 'GET') {
    // Full revision history for one document — "show a history if
    // prompted to", surfaced by the frontend behind a "Version history" button.
    $docId = isset($_GET['document_id']) ? (int)$_GET['document_id'] : 0;
    if (!$docId) { http_response_code(422); exit(json_encode(['error' => 'Missing document_id'])); }

    $doc = loadDocument($pdo, $docId);
    if (!$doc) { http_response_code(404); exit(json_encode(['error' => 'Document not found'])); }
    if ($scope !== null && !in_array($doc['project_number'], $scope, true)) {
        http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
    }

    $stmt = $pdo->prepare('SELECT * FROM document_versions WHERE document_id = ? ORDER BY version_number DESC');
    $stmt->execute([$docId]);
    $versions = array_map(function ($v) {
        return [
            'id'                => (int)$v['id'],
            'version_number'    => (int)$v['version_number'],
            'url'               => APP_URL . '/uploads/' . $v['file_path'],
            'original_filename' => $v['original_filename'],
            'notes'             => $v['notes'],
            'uploaded_by_name'  => $v['uploaded_by_name'],
            'uploaded_at'       => $v['uploaded_at'],
        ];
    }, $stmt->fetchAll());

    echo json_encode(['document' => ['id' => (int)$doc['id'], 'title' => $doc['title'], 'category' => $doc['category']], 'versions' => $versions]);

} elseif ($method === 'POST') {
    $docId = isset($_POST['document_id']) ? (int)$_POST['document_id'] : 0;
    $notes = !empty($_POST['notes']) ? sanitizeString($_POST['notes']) : null;
    if (!$docId) { http_response_code(422); exit(json_encode(['error' => 'Missing document_id'])); }

    $doc = loadDocument($pdo, $docId);
    if (!$doc) { http_response_code(404); exit(json_encode(['error' => 'Document not found'])); }
    if ($scope !== null && !in_array($doc['project_number'], $scope, true)) {
        http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
    }

    $file = $_FILES['file'] ?? null;
    if (!$file || $file['error'] !== UPLOAD_ERR_OK || empty($file['name'])) {
        http_response_code(422); exit(json_encode(['error' => 'A file is required']));
    }
    if ($file['size'] > MAX_UPLOAD_BYTES) {
        http_response_code(422); exit(json_encode(['error' => 'File must be 150MB or smaller']));
    }
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ALLOWED_EXTENSIONS, true)) {
        http_response_code(422); exit(json_encode(['error' => 'Unsupported file type']));
    }

    if (!is_dir(UPLOAD_DIR)) { mkdir(UPLOAD_DIR, 0755, true); }

    $movedFile = null;
    try {
        $pdo->beginTransaction();

        // SELECT ... FOR UPDATE would be ideal against concurrent uploads to
        // the same document; low-volume internal tool, so a simple
        // MAX()+1 inside the transaction is an acceptable tradeoff here —
        // the UNIQUE KEY on (document_id, version_number) still guarantees
        // no duplicate/corrupt version numbers even in the rare race.
        $maxStmt = $pdo->prepare('SELECT COALESCE(MAX(version_number), 0) AS max_v FROM document_versions WHERE document_id = ? FOR UPDATE');
        $maxStmt->execute([$docId]);
        $nextVersion = (int)$maxStmt->fetch()['max_v'] + 1;

        $filename = "{$docId}-v{$nextVersion}-" . bin2hex(random_bytes(6)) . ".{$ext}";
        $dest = UPLOAD_DIR . '/' . $filename;
        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            throw new RuntimeException('Could not save the file');
        }
        $movedFile = $dest;

        $pdo->prepare(
            'INSERT INTO document_versions (document_id, version_number, file_path, original_filename, notes, uploaded_by, uploaded_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$docId, $nextVersion, "documents/{$filename}", $file['name'], $notes, $auth['user_id'], $auth['name']]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        if ($movedFile) { @unlink($movedFile); }
        http_response_code(500); exit(json_encode(['error' => 'Could not save the new version']));
    }

    notifyProjectClients(
        $pdo, $doc['project_number'], 'document_uploaded',
        "Updated document on project #{$doc['project_number']}",
        "{$doc['title']} — new version uploaded",
        "/portal/projects/{$doc['project_number']}?tab=documents&doc={$docId}"
    );

    echo json_encode(['version_number' => $nextVersion, 'message' => 'New version saved']);

} else { http_response_code(405); }
