<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';

// Public — validates a client account-setup token so the /portal/setup/<token>
// page can greet the client by name before they pick a password. Never
// reveals whether an unknown token maps to a real account.
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$token = isset($_GET['token']) ? (string) $_GET['token'] : '';
if ($token === '') { http_response_code(422); exit(json_encode(['error' => 'Missing token'])); }

$pdo  = getPDO();
$stmt = $pdo->prepare(
    'SELECT c.name, c.email
       FROM client_setup_tokens t
       JOIN clients c ON c.id = t.client_id
      WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > NOW() AND c.is_active = 1'
);
$stmt->execute([hash('sha256', $token)]);
$row = $stmt->fetch();

if (!$row) {
    http_response_code(410);
    exit(json_encode(['error' => 'This setup link is invalid or has expired. Ask your JCCS project manager to resend it.']));
}

echo json_encode(['name' => $row['name'], 'email' => $row['email']]);
