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


// Internal thread on a request (field manager ⇄ office). Never part of the
// generated estimate. info_request/info_response entries are written by
// action.php; this endpoint only adds plain notes.
$auth = requireAuth(QR_ROLES);
$pdo  = getPDO();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body = jsonBody();
$id   = (int)($body['quote_request_id'] ?? 0);
$text = trim((string)($body['body'] ?? ''));
if (!$id || $text === '') { http_response_code(422); exit(json_encode(['error' => 'Write a comment first'])); }
$row = qrLoadVisible($pdo, $auth, $id);

$pdo->prepare("INSERT INTO quote_request_comments (quote_request_id, kind, body, author_id, author_name) VALUES (?, 'note', ?, ?, ?)")
    ->execute([$id, mb_substr($text, 0, 5000), $auth['user_id'], $auth['name']]);
$commentId = (int)$pdo->lastInsertId();

// Office comments reach the field manager; field comments reach the office.
if (qrIsAdmin($auth)) {
    qrNotifyUser($pdo, qrFieldUserId($row), $row, 'quote_comment', 'Comment on ' . $row['title'], $text, $auth['user_id']);
} else {
    qrNotifyOffice($pdo, $row, 'quote_comment', 'Comment on ' . $row['title'], $text, $auth['user_id']);
}

echo json_encode(['id' => $commentId, 'message' => 'Comment added']);
