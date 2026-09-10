<?php
// PUT    /api/financial-docs/item.php?id=NN   — reassign to a project / edit metadata
//        body: { project_number?, type?, doc_number?, amount?, issue_date?,
//                due_date?, doc_status?, title? }
// DELETE /api/financial-docs/item.php?id=NN   — archive (soft; is_active = 0)
//
// This is the "sort into the right project group" action — move a doc out of
// the Unfiled tray onto its project (admin only), or fix a mis-matched one.
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$scope  = pmProjectScope($auth);
$id     = isset($_GET['id']) ? (int) $_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

$stmt = $pdo->prepare("SELECT * FROM documents WHERE id = ? AND category IN ('estimate','invoice')");
$stmt->execute([$id]);
$row = $stmt->fetch();
if (!$row) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }

// A scoped PM can only touch docs already on one of their projects.
if ($scope !== null && !in_array($row['project_number'], $scope, true)) {
    http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
}

if ($method === 'DELETE') {
    $pdo->prepare('UPDATE documents SET is_active = 0 WHERE id = ?')->execute([$id]);
    echo json_encode(['ok' => true, 'archived' => true]);
    exit;
}

if ($method !== 'PUT') { http_response_code(405); exit(json_encode(['error' => 'Method not allowed'])); }

$body = jsonBody();
$set = [];
$params = [];

if (array_key_exists('project_number', $body)) {
    $pn = trim((string) $body['project_number']);
    if (!preg_match('/^\d{4}$/', $pn)) {
        http_response_code(422); exit(json_encode(['error' => 'Estimate # must be exactly 4 digits']));
    }
    // Reassigning INTO a project requires access to the target too.
    if ($scope !== null && !in_array($pn, $scope, true)) {
        http_response_code(403); exit(json_encode(['error' => 'Not assigned to the target project']));
    }
    $set[] = 'project_number = ?'; $params[] = $pn;
    // A human placed it — trust it.
    $set[] = "match_confidence = 'high'";
}
if (array_key_exists('type', $body) && in_array($body['type'], ['estimate', 'invoice'], true)) {
    $set[] = 'category = ?'; $params[] = $body['type'];
}
foreach (['doc_number' => 60, 'doc_status' => 20, 'title' => 200] as $col => $len) {
    if (array_key_exists($col, $body)) {
        $set[] = "$col = ?";
        $params[] = $body[$col] !== '' && $body[$col] !== null ? mb_substr(sanitizeString((string) $body[$col]), 0, $len) : null;
    }
}
foreach (['issue_date', 'due_date'] as $col) {
    if (array_key_exists($col, $body)) {
        $set[] = "$col = ?";
        $params[] = $body[$col] !== '' && $body[$col] !== null ? (string) $body[$col] : null;
    }
}
if (array_key_exists('amount', $body)) {
    $set[] = 'amount = ?';
    $params[] = $body['amount'] !== '' && $body['amount'] !== null ? (float) $body['amount'] : null;
}

if ($set) {
    $params[] = $id;
    $pdo->prepare('UPDATE documents SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($params);
}

$stmt = $pdo->prepare('SELECT id, project_number, category AS type, title, doc_number, amount, issue_date, due_date, doc_status, source, match_confidence FROM documents WHERE id = ?');
$stmt->execute([$id]);
echo json_encode($stmt->fetch());
