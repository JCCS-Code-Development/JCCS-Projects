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
const STATUSES = ['pending', 'approved', 'approved_as_noted', 'revise_resubmit', 'rejected'];

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$scope  = pmProjectScope($auth); // null = admin, unrestricted

function fetchSubmittalsWithExtras(PDO $pdo, string $sql, array $params): array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    if (!$rows) return [];

    $ids = array_column($rows, 'id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $vStmt = $pdo->prepare(
        "SELECT sv.* FROM submittal_versions sv
         INNER JOIN (SELECT submittal_id, MAX(version_number) AS max_v FROM submittal_versions WHERE submittal_id IN ($placeholders) GROUP BY submittal_id) latest
           ON latest.submittal_id = sv.submittal_id AND latest.max_v = sv.version_number"
    );
    $vStmt->execute($ids);
    $latestByRow = [];
    foreach ($vStmt->fetchAll() as $v) { $latestByRow[$v['submittal_id']] = $v; }

    $cStmt = $pdo->prepare("SELECT submittal_id, COUNT(*) AS cnt FROM submittal_versions WHERE submittal_id IN ($placeholders) GROUP BY submittal_id");
    $cStmt->execute($ids);
    $countByRow = [];
    foreach ($cStmt->fetchAll() as $c) { $countByRow[$c['submittal_id']] = (int)$c['cnt']; }

    foreach ($rows as &$row) {
        $latest = $latestByRow[$row['id']] ?? null;
        $row['version_count'] = $countByRow[$row['id']] ?? 0;
        $row['latest_version'] = $latest ? [
            'version_number'    => (int)$latest['version_number'],
            'url'               => APP_URL . '/uploads/' . $latest['file_path'],
            'original_filename' => $latest['original_filename'],
            'notes'             => $latest['notes'],
            'uploaded_by_name'  => $latest['uploaded_by_name'],
            'uploaded_at'       => $latest['uploaded_at'],
        ] : null;
    }
    return $rows;
}

if ($method === 'GET') {
    $params = [];
    $sql = 'SELECT * FROM submittals';
    $where = [];
    if (!empty($_GET['project_number'])) {
        $where[] = 'project_number = ?';
        $params[] = $_GET['project_number'];
    }
    if ($scope !== null) {
        if (empty($scope)) { echo json_encode(['submittals' => []]); exit; }
        $placeholders = implode(',', array_fill(0, count($scope), '?'));
        $where[] = "project_number IN ($placeholders)";
        $params = array_merge($params, $scope);
    }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY project_number, submittal_number DESC LIMIT 200';

    echo json_encode(['submittals' => fetchSubmittalsWithExtras($pdo, $sql, $params)]);

} elseif ($method === 'POST') {
    $projectNumber = trim((string)($_POST['project_number'] ?? ''));
    $title         = trim((string)($_POST['title'] ?? ''));
    $specSection   = !empty($_POST['spec_section']) ? sanitizeString($_POST['spec_section']) : null;
    $dueDate       = !empty($_POST['due_date']) ? trim((string)$_POST['due_date']) : null;
    $notes         = !empty($_POST['notes']) ? sanitizeString($_POST['notes']) : null;

    if ($projectNumber === '' || $title === '') {
        http_response_code(422); exit(json_encode(['error' => 'Missing required field']));
    }
    if (!preg_match('/^\d{4}$/', $projectNumber)) {
        http_response_code(422); exit(json_encode(['error' => 'Estimate # must be exactly 4 digits']));
    }
    if ($scope !== null && !in_array($projectNumber, $scope, true)) {
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

        // Sequential per project, same MAX()+1-inside-transaction tradeoff
        // as document_versions (low-volume internal tool; the UNIQUE KEY on
        // (project_number, submittal_number) still prevents corruption in
        // the rare concurrent-insert race).
        $numStmt = $pdo->prepare('SELECT COALESCE(MAX(submittal_number), 0) AS max_n FROM submittals WHERE project_number = ? FOR UPDATE');
        $numStmt->execute([$projectNumber]);
        $submittalNumber = (int)$numStmt->fetch()['max_n'] + 1;

        $pdo->prepare(
            'INSERT INTO submittals (project_number, submittal_number, title, spec_section, submitted_by, submitted_by_name, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$projectNumber, $submittalNumber, sanitizeString($title), $specSection, $auth['user_id'], $auth['name'], $dueDate]);
        $submittalId = (int)$pdo->lastInsertId();

        $filename = "{$submittalId}-v1-" . bin2hex(random_bytes(6)) . ".{$ext}";
        $dest = UPLOAD_DIR . '/' . $filename;
        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            throw new RuntimeException('Could not save the file');
        }
        $movedFile = $dest;

        $pdo->prepare(
            'INSERT INTO submittal_versions (submittal_id, version_number, file_path, original_filename, notes, uploaded_by, uploaded_by_name)
             VALUES (?, 1, ?, ?, ?, ?, ?)'
        )->execute([$submittalId, "submittals/{$filename}", $file['name'], $notes, $auth['user_id'], $auth['name']]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        if ($movedFile) { @unlink($movedFile); }
        http_response_code(500); exit(json_encode(['error' => 'Could not save the submittal']));
    }

    notifyProjectClients(
        $pdo, $projectNumber, 'submittal_created',
        "New submittal on project #{$projectNumber}",
        "#{$submittalNumber} — {$title}",
        "/portal/projects/{$projectNumber}?tab=submittals&submittal={$submittalId}"
    );

    echo json_encode(['id' => $submittalId, 'submittal_number' => $submittalNumber, 'message' => 'Submittal saved']);

} else { http_response_code(405); }
