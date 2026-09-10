<?php
// GET  /api/financial-docs/index.php?project_number=1234   → that project's estimates + invoices
// GET  /api/financial-docs/index.php?unfiled=1              → the Unfiled tray
// GET  /api/financial-docs/index.php?type=invoice           → filter by type (optional, combine with the above)
// POST /api/financial-docs/index.php   (multipart) → manual upload of an estimate/invoice
//
// Staff auth (same JWT + pmProjectScope as the Documents module). Estimates &
// invoices are stored as `documents` rows in category estimate|invoice.
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/_ingest.php';

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$scope  = pmProjectScope($auth); // null = admin, unrestricted

function financialRows(PDO $pdo, string $where, array $params): array {
    $sql = "SELECT * FROM documents WHERE is_active = 1 AND category IN ('estimate','invoice')"
         . ($where ? " AND $where" : '')
         . ' ORDER BY COALESCE(issue_date, DATE(created_at)) DESC, id DESC LIMIT 300';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $docs = $stmt->fetchAll();
    if (!$docs) return [];

    $ids = array_column($docs, 'id');
    $ph  = implode(',', array_fill(0, count($ids), '?'));
    $vStmt = $pdo->prepare(
        "SELECT dv.* FROM document_versions dv
         JOIN (SELECT document_id, MAX(version_number) mv FROM document_versions WHERE document_id IN ($ph) GROUP BY document_id) l
           ON l.document_id = dv.document_id AND l.mv = dv.version_number"
    );
    $vStmt->execute($ids);
    $latest = [];
    foreach ($vStmt->fetchAll() as $v) $latest[$v['document_id']] = $v;

    return array_map(function ($d) use ($latest) {
        $v = $latest[$d['id']] ?? null;
        return [
            'id'               => (int) $d['id'],
            'project_number'   => $d['project_number'],
            'type'             => $d['category'],
            'title'            => $d['title'],
            'doc_number'       => $d['doc_number'],
            'amount'           => $d['amount'] !== null ? (float) $d['amount'] : null,
            'issue_date'       => $d['issue_date'],
            'due_date'         => $d['due_date'],
            'doc_status'       => $d['doc_status'],
            'source'           => $d['source'],
            'match_confidence' => $d['match_confidence'],
            'created_at'       => $d['created_at'],
            'file_url'         => $v ? APP_URL . '/uploads/' . $v['file_path'] : null,
            'original_filename'=> $v['original_filename'] ?? null,
        ];
    }, $docs);
}

if ($method === 'GET') {
    $where = [];
    $params = [];

    if (!empty($_GET['unfiled'])) {
        $where[] = 'project_number = ?';
        $params[] = FIN_UNFILED;
        // Unfiled is admin-only (a scoped PM has no business seeing every stray doc).
        if ($scope !== null) { echo json_encode(['docs' => []]); exit; }
    } elseif (!empty($_GET['project_number']) && preg_match('/^\d{4}$/', $_GET['project_number'])) {
        $where[] = 'project_number = ?';
        $params[] = $_GET['project_number'];
        if ($scope !== null && !in_array($_GET['project_number'], $scope, true)) {
            http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
        }
    } elseif ($scope !== null) {
        if (empty($scope)) { echo json_encode(['docs' => []]); exit; }
        $where[] = 'project_number IN (' . implode(',', array_fill(0, count($scope), '?')) . ')';
        $params = array_merge($params, $scope);
    }

    if (!empty($_GET['type']) && in_array($_GET['type'], ['estimate', 'invoice'], true)) {
        $where[] = 'category = ?';
        $params[] = $_GET['type'];
    }

    echo json_encode(['docs' => financialRows($pdo, implode(' AND ', $where), $params)]);
    exit;
}

if ($method === 'POST') {
    $file = $_FILES['file'] ?? null;
    if (!$file || $file['error'] !== UPLOAD_ERR_OK || empty($file['name'])) {
        http_response_code(422); exit(json_encode(['error' => 'A file is required']));
    }
    $projectNumber = trim((string) ($_POST['project_number'] ?? ''));
    if (!preg_match('/^\d{4}$/', $projectNumber)) {
        http_response_code(422); exit(json_encode(['error' => 'Estimate # must be exactly 4 digits']));
    }
    if ($scope !== null && !in_array($projectNumber, $scope, true)) {
        http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
    }

    $meta = ['project_number' => $projectNumber];
    foreach (['type', 'doc_number', 'amount', 'issue_date', 'due_date', 'doc_status', 'title'] as $k) {
        if (isset($_POST[$k]) && $_POST[$k] !== '') $meta[$k] = $_POST[$k];
    }

    try {
        $res = storeFinancialDoc($pdo, $file['tmp_name'], $file['name'], 'manual', $meta, $auth['user_id'], $auth['name']);
        http_response_code(201);
        echo json_encode($res);
    } catch (Throwable $e) {
        http_response_code(422);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
