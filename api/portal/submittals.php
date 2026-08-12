<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Read-only, scoped strictly to client_project_access. Same shape as
// portal/documents.php: list with latest-version summary, or ?id= for one
// submittal's full version history. No status-change verb here — that
// review workflow stays on the staff side (see submittals/item.php).
$auth = requireClientAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$pdo = getPDO();

function fetchPortalSubmittalExtras(PDO $pdo, array $ids): array {
    if (!$ids) return [[], []];
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

    return [$latestByRow, $countByRow];
}

if (empty($_GET['id'])) {
    if (empty($auth['projects'])) { echo json_encode(['submittals' => []]); exit; }
    $projects = $auth['projects'];
    if (!empty($_GET['project_number'])) {
        $projects = in_array($_GET['project_number'], $auth['projects'], true) ? [$_GET['project_number']] : [];
    }
    if (empty($projects)) { echo json_encode(['submittals' => []]); exit; }

    $placeholders = implode(',', array_fill(0, count($projects), '?'));
    $stmt = $pdo->prepare("SELECT * FROM submittals WHERE project_number IN ($placeholders) ORDER BY project_number, submittal_number DESC LIMIT 200");
    $stmt->execute($projects);
    $rows = $stmt->fetchAll();
    if ($rows) {
        [$latestByRow, $countByRow] = fetchPortalSubmittalExtras($pdo, array_column($rows, 'id'));
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
    }
    echo json_encode(['submittals' => $rows]);
    exit;
}

$id = (int)$_GET['id'];
$stmt = $pdo->prepare('SELECT * FROM submittals WHERE id = ?');
$stmt->execute([$id]);
$submittal = $stmt->fetch();
if (!$submittal || !in_array($submittal['project_number'], $auth['projects'], true)) {
    http_response_code(404); exit(json_encode(['error' => 'Submittal not found']));
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
echo json_encode(['submittal' => ['id' => (int)$submittal['id'], 'title' => $submittal['title'], 'submittal_number' => (int)$submittal['submittal_number']], 'versions' => $versions]);
