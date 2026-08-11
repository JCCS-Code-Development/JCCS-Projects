<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../middleware/validate.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body = jsonBody();
if (!empty($body['refreshToken'])) {
    $pdo = getPDO();
    $pdo->prepare('DELETE FROM client_refresh_tokens WHERE token_hash = ?')
        ->execute([hash('sha256', (string)$body['refreshToken'])]);
}
// Always succeeds — best-effort, non-blocking, same as FieldClock's own logout.php.
echo json_encode(['message' => 'Logged out']);
