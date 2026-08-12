<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Read-only, scoped strictly to client_project_access. Same static
// divisions and same "latest version + count, full history on demand"
// shape as the staff endpoint — clients can browse revision history too,
// just never upload.
$auth = requireClientAuth();
$method = $_SERVER['REQUEST_METHOD'];
$pdo = getPDO();

function fetchPortalDocumentsWithExtras(PDO $pdo, array $ids): array {
    if (!$ids) return [];
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
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

    return [$latestByDoc, $countByDoc];
}

if ($method === 'GET') {
    if (empty($_GET['id'])) {
        if (empty($auth['projects'])) { echo json_encode(['documents' => []]); exit; }
        $projects = $auth['projects'];
        if (!empty($_GET['project_number'])) {
            $projects = in_array($_GET['project_number'], $auth['projects'], true) ? [$_GET['project_number']] : [];
        }
        if (empty($projects)) { echo json_encode(['documents' => []]); exit; }

        $placeholders = implode(',', array_fill(0, count($projects), '?'));
        $stmt = $pdo->prepare("SELECT * FROM documents WHERE is_active = 1 AND project_number IN ($placeholders) ORDER BY created_at DESC, id DESC LIMIT 200");
        $stmt->execute($projects);
        $docs = $stmt->fetchAll();
        if ($docs) {
            [$latestByDoc, $countByDoc] = fetchPortalDocumentsWithExtras($pdo, array_column($docs, 'id'));
            foreach ($docs as &$doc) {
                $latest = $latestByDoc[$doc['id']] ?? null;
                $doc['version_count'] = $countByDoc[$doc['id']] ?? 0;
                $doc['latest_version'] = $latest ? [
                    'version_number'   => (int)$latest['version_number'],
                    'url'              => APP_URL . '/uploads/' . $latest['file_path'],
                    'original_filename'=> $latest['original_filename'],
                    'notes'            => $latest['notes'],
                    'uploaded_by_name' => $latest['uploaded_by_name'],
                    'uploaded_at'      => $latest['uploaded_at'],
                ] : null;
            }
        }
        echo json_encode(['documents' => $docs]);
        exit;
    }

    // Version history for one document.
    $docId = (int)$_GET['id'];
    $stmt = $pdo->prepare('SELECT * FROM documents WHERE id = ? AND is_active = 1');
    $stmt->execute([$docId]);
    $doc = $stmt->fetch();
    if (!$doc || !in_array($doc['project_number'], $auth['projects'], true)) {
        http_response_code(404); exit(json_encode(['error' => 'Document not found']));
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

} else { http_response_code(405); }
