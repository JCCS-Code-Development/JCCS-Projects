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

const UPLOAD_DIR       = __DIR__ . '/../uploads/submittals';
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // raised from 25MB to accommodate video walkthroughs
const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx', 'dwg', 'dxf', 'mp4', 'mov', 'webm'];

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$scope  = pmProjectScope($auth);

function loadSubmittal(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM submittals WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

if ($method === 'GET') {
    // Full resubmission history — same "show a history if prompted to"
    // pattern as documents/versions.php.
    $id = isset($_GET['submittal_id']) ? (int)$_GET['submittal_id'] : 0;
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing submittal_id'])); }

    $submittal = loadSubmittal($pdo, $id);
    if (!$submittal) { http_response_code(404); exit(json_encode(['error' => 'Submittal not found'])); }
    if ($scope !== null && !in_array($submittal['project_number'], $scope, true)) {
        http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
    }

    $stmt = $pdo->prepare('SELECT * FROM submittal_versions WHERE submittal_id = ? ORDER BY version_number DESC');
    $stmt->execute([$id]);
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

    echo json_encode([
        'submittal' => ['id' => (int)$submittal['id'], 'title' => $submittal['title'], 'submittal_number' => (int)$submittal['submittal_number']],
        'versions'  => $versions,
    ]);

} elseif ($method === 'POST') {
    $id    = isset($_POST['submittal_id']) ? (int)$_POST['submittal_id'] : 0;
    $notes = !empty($_POST['notes']) ? sanitizeString($_POST['notes']) : null;
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing submittal_id'])); }

    $submittal = loadSubmittal($pdo, $id);
    if (!$submittal) { http_response_code(404); exit(json_encode(['error' => 'Submittal not found'])); }
    if ($scope !== null && !in_array($submittal['project_number'], $scope, true)) {
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

        $maxStmt = $pdo->prepare('SELECT COALESCE(MAX(version_number), 0) AS max_v FROM submittal_versions WHERE submittal_id = ? FOR UPDATE');
        $maxStmt->execute([$id]);
        $nextVersion = (int)$maxStmt->fetch()['max_v'] + 1;

        $filename = "{$id}-v{$nextVersion}-" . bin2hex(random_bytes(6)) . ".{$ext}";
        $dest = UPLOAD_DIR . '/' . $filename;
        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            throw new RuntimeException('Could not save the file');
        }
        $movedFile = $dest;

        $pdo->prepare(
            'INSERT INTO submittal_versions (submittal_id, version_number, file_path, original_filename, notes, uploaded_by, uploaded_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$id, $nextVersion, "submittals/{$filename}", $file['name'], $notes, $auth['user_id'], $auth['name']]);

        // A resubmission naturally resets the review — the prior
        // approved/rejected verdict was against the OLD file.
        $pdo->prepare("UPDATE submittals SET status = 'pending', reviewed_by = NULL, reviewed_by_name = NULL, reviewed_at = NULL WHERE id = ?")
            ->execute([$id]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        if ($movedFile) { @unlink($movedFile); }
        http_response_code(500); exit(json_encode(['error' => 'Could not save the new version']));
    }

    notifyProjectClients(
        $pdo, $submittal['project_number'], 'submittal_created',
        "Resubmitted — project #{$submittal['project_number']}",
        "#{$submittal['submittal_number']} — {$submittal['title']}",
        "/portal/projects/{$submittal['project_number']}?tab=submittals&submittal={$id}"
    );

    echo json_encode(['version_number' => $nextVersion, 'message' => 'New version saved']);

} else { http_response_code(405); }
