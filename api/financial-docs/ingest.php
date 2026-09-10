<?php
// POST /api/financial-docs/ingest.php   (multipart/form-data)
//   file        — the estimate/invoice PDF (required)
//   type        — estimate | invoice   (optional; guessed from the text)
//   subject     — email subject line   (optional; helps the Estimate # match)
//   body_text   — plain-text email body (optional)
//   doc_number, amount, issue_date, due_date, doc_status, project_number — optional
//
// Token-gated (X-Board-Token vs OPS_BOARD_TOKEN) — this is for a
// webhook/Zapier/manual-curl path. The email poller uses _ingest.php directly.
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/_ingest.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit(json_encode(['error' => 'Method not allowed']));
}

$expected = defined('OPS_BOARD_TOKEN') ? (string) OPS_BOARD_TOKEN : '';
$given    = (string) ($_SERVER['HTTP_X_BOARD_TOKEN'] ?? '');
if ($expected === '' || $expected === 'CHANGE_ME' || !hash_equals($expected, $given)) {
    http_response_code(401);
    exit(json_encode(['error' => 'Invalid board token']));
}

$file = $_FILES['file'] ?? null;
if (!$file || $file['error'] !== UPLOAD_ERR_OK || empty($file['name'])) {
    http_response_code(422);
    exit(json_encode(['error' => 'A file is required']));
}

$meta = [];
foreach (['type', 'subject', 'body_text', 'doc_number', 'amount', 'issue_date', 'due_date', 'doc_status', 'project_number', 'title'] as $k) {
    if (isset($_POST[$k]) && $_POST[$k] !== '') $meta[$k] = $_POST[$k];
}

try {
    $pdo = getPDO();
    $res = storeFinancialDoc($pdo, $file['tmp_name'], $file['name'], 'api', $meta);
    http_response_code(201);
    echo json_encode($res);
} catch (Throwable $e) {
    http_response_code(422);
    echo json_encode(['error' => $e->getMessage()]);
}
