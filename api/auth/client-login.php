<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/validate.php';

// Entirely local login for external clients — never touches FieldClock.
// Same shape as FieldClock's own login.php (identifier+password, a short
// lockout window) but against the local `clients` table and signed with
// CLIENT_JWT_SECRET instead of the shared staff JWT_SECRET.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

const MAX_ATTEMPTS  = 5;
const LOCKOUT_MINS  = 15;
const REFRESH_DAYS  = 30;

$body = jsonBody();
requireFields($body, ['email', 'password']);
$email = strtolower(trim((string)$body['email']));

$pdo  = getPDO();
$stmt = $pdo->prepare('SELECT * FROM clients WHERE email = ?');
$stmt->execute([$email]);
$client = $stmt->fetch();

if ($client && $client['locked_until'] && strtotime($client['locked_until']) > time()) {
    http_response_code(429);
    exit(json_encode(['error' => 'Too many attempts. Try again later.']));
}

if (!$client || !$client['is_active'] || !password_verify((string)$body['password'], $client['password_hash'])) {
    if ($client) {
        $attempts = (int)$client['failed_attempts'] + 1;
        $locked   = $attempts >= MAX_ATTEMPTS
            ? (new DateTimeImmutable('+' . LOCKOUT_MINS . ' minutes'))->format('Y-m-d H:i:s')
            : null;
        $pdo->prepare('UPDATE clients SET failed_attempts = ?, locked_until = ? WHERE id = ?')
            ->execute([$attempts, $locked, $client['id']]);
    }
    http_response_code(401);
    exit(json_encode(['error' => 'Invalid email or password']));
}

$pdo->prepare('UPDATE clients SET failed_attempts = 0, locked_until = NULL WHERE id = ?')->execute([$client['id']]);

$now   = time();
$token = client_jwt_encode(['client_id' => (int)$client['id'], 'type' => 'client', 'iat' => $now, 'exp' => $now + CLIENT_JWT_EXPIRY]);

$refreshToken = bin2hex(random_bytes(32));
$expiresAt    = (new DateTimeImmutable('+' . REFRESH_DAYS . ' days'))->format('Y-m-d H:i:s');
$pdo->prepare('INSERT INTO client_refresh_tokens (client_id, token_hash, expires_at) VALUES (?, ?, ?)')
    ->execute([$client['id'], hash('sha256', $refreshToken), $expiresAt]);

echo json_encode([
    'token'        => $token,
    'refreshToken' => $refreshToken,
    'client'       => ['id' => (int)$client['id'], 'name' => $client['name'], 'email' => $client['email']],
]);
