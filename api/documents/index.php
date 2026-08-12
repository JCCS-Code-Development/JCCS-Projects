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

// Documents live in five STATIC divisions (the ENUM below — not a
// user-editable taxonomy): drawing, scope, estimate, contract, permit.
// 'estimate' has no upload UI on the frontend yet (a placeholder — estimates
// are meant to eventually come from jccs-inventory's own data), but the
// backend doesn't need to special-case it: a document is just a document.
// Every upload is append-only (document_versions), so a full revision
// history survives for every division, not just drawings.
const UPLOAD_DIR       = __DIR__ . '/../uploads/documents';
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // raised from 25MB to accommodate video walkthroughs
// MIME-sniffing office/CAD formats is unreliable (docx/xlsx are zip
// containers, DWG is a proprietary binary finfo doesn't recognize) — so
// unlike daily-log photos (rendered inline as <img>, hence real MIME
// verification), documents are validated by extension allowlist + size cap.
// They're never executed (uploads/documents/.htaccess disables that) and
// never rendered inline, only downloaded, so this is the right-sized check.
const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx', 'dwg', 'dxf', 'mp4', 'mov', 'webm'];
const CATEGORIES = ['drawing', 'scope', 'estimate', 'contract', 'permit'];

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$scope  = pmProjectScope($auth); // null = admin, unrestricted

function fetchDocumentsWithExtras(PDO $pdo, string $sql, array $params): array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $docs = $stmt->fetchAll();
    if (!$docs) return [];

    $ids = array_column($docs, 'id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    // Latest version per document (MAX version_number), plus a total count —
    // the version HISTORY itself is fetched separately, on demand, via
    // documents/versions.php, to keep this list endpoint light.
    $vStmt = $pdo->prepare(
        "SELECT dv.* FROM document_versions dv
         INNER JOIN (SELECT document_id, MAX(version_number) AS max_v FROM document_versions WHERE document_id IN ($placeholders) GROUP BY document_id) latest
           ON latest.document_id = dv.document_id AND latest.max_v = dv.version_number"
    );
    $vStmt->execute($ids);
    $latestByDoc = [];
    foreach ($vStmt->fetchAll() as $v) { $latestByDoc[$v['document_id']] = $v; }

    $cStmt = $pdo->prepare("SELECT document_id, COUNT(*) AS cnt FROM document_versions WHERE document_id IN ($placeholders) GROUP BY document_id");
    $cStmt->execute($ids);
    $countByDoc = [];
    foreach ($cStmt->fetchAll() as $c) { $countByDoc[$c['document_id']] = (int)$c['cnt']; }

    foreach ($docs as &$doc) {
        $latest = $latestByDoc[$doc['id']] ?? null;
        $doc['version_count'] = $countByDoc[$doc['id']] ?? 0;
        $doc['latest_version'] = $latest ? [
            'version_number'    => (int)$latest['version_number'],
            'url'                => APP_URL . '/uploads/' . $latest['file_path'],
            'original_filename'  => $latest['original_filename'],
            'notes'              => $latest['notes'],
            'uploaded_by_name'   => $latest['uploaded_by_name'],
            'uploaded_at'        => $latest['uploaded_at'],
        ] : null;
    }
    return $docs;
}

if ($method === 'GET') {
    $params = [];
    $sql = 'SELECT * FROM documents WHERE is_active = 1';
    $where = [];
    if (!empty($_GET['project_number'])) {
        $where[] = 'project_number = ?';
        $params[] = $_GET['project_number'];
    }
    if (!empty($_GET['category']) && in_array($_GET['category'], CATEGORIES, true)) {
        $where[] = 'category = ?';
        $params[] = $_GET['category'];
    }
    if ($scope !== null) {
        if (empty($scope)) { echo json_encode(['documents' => []]); exit; }
        $placeholders = implode(',', array_fill(0, count($scope), '?'));
        $where[] = "project_number IN ($placeholders)";
        $params = array_merge($params, $scope);
    }
    if ($where) $sql .= ' AND ' . implode(' AND ', $where);
    $sql .= ' ORDER BY created_at DESC, id DESC LIMIT 200';

    echo json_encode(['documents' => fetchDocumentsWithExtras($pdo, $sql, $params)]);

} elseif ($method === 'POST') {
    // multipart/form-data — creating a document always uploads its first
    // version in the same step (never a document with zero versions).
    $projectNumber = trim((string)($_POST['project_number'] ?? ''));
    $category      = trim((string)($_POST['category'] ?? ''));
    $title         = trim((string)($_POST['title'] ?? ''));
    $notes         = !empty($_POST['notes']) ? sanitizeString($_POST['notes']) : null;

    if ($projectNumber === '' || $category === '' || $title === '') {
        http_response_code(422); exit(json_encode(['error' => 'Missing required field']));
    }
    if (!preg_match('/^\d{4}$/', $projectNumber)) {
        http_response_code(422); exit(json_encode(['error' => 'Estimate # must be exactly 4 digits']));
    }
    if (!in_array($category, CATEGORIES, true)) {
        http_response_code(422); exit(json_encode(['error' => 'Invalid category']));
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

        $pdo->prepare(
            'INSERT INTO documents (project_number, category, title, created_by) VALUES (?, ?, ?, ?)'
        )->execute([$projectNumber, $category, sanitizeString($title), $auth['user_id']]);
        $docId = (int)$pdo->lastInsertId();

        $filename = "{$docId}-v1-" . bin2hex(random_bytes(6)) . ".{$ext}";
        $dest = UPLOAD_DIR . '/' . $filename;
        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            throw new RuntimeException('Could not save the file');
        }
        $movedFile = $dest;

        $pdo->prepare(
            'INSERT INTO document_versions (document_id, version_number, file_path, original_filename, notes, uploaded_by, uploaded_by_name)
             VALUES (?, 1, ?, ?, ?, ?, ?)'
        )->execute([$docId, "documents/{$filename}", $file['name'], $notes, $auth['user_id'], $auth['name']]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        if ($movedFile) { @unlink($movedFile); }
        http_response_code(500); exit(json_encode(['error' => 'Could not save the document']));
    }

    notifyProjectClients(
        $pdo, $projectNumber, 'document_uploaded',
        "New document on project #{$projectNumber}",
        $title,
        "/portal/projects/{$projectNumber}?tab=documents&doc={$docId}"
    );

    echo json_encode(['id' => $docId, 'message' => 'Document saved']);

} else { http_response_code(405); }
