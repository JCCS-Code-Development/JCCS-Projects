<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/validate.php';

// Public — completes a client account setup: the token from the invite email
// plus a chosen password. On success the client is logged straight in (same
// token + refresh-token pair as client-login.php), so the /portal/setup page
// can drop them into the portal without a second sign-in.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

const REFRESH_DAYS = 30;

$body = jsonBody();
requireFields($body, ['token', 'password']);
$token    = (string) $body['token'];
$password = (string) $body['password'];

if (strlen($password) < 8) {
    http_response_code(422);
    exit(json_encode(['error' => 'Password must be at least 8 characters']));
}

$pdo = getPDO();
$stmt = $pdo->prepare(
    'SELECT t.id AS token_id, c.id AS client_id, c.name, c.email
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

$clientId = (int) $row['client_id'];

$pdo->beginTransaction();
try {
    $pdo->prepare('UPDATE clients SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?')
        ->execute([password_hash($password, PASSWORD_DEFAULT), $clientId]);
    $pdo->prepare('UPDATE client_setup_tokens SET used_at = NOW() WHERE id = ?')->execute([$row['token_id']]);
    // Any other outstanding setup tokens for this client are now moot.
    $pdo->prepare("UPDATE client_setup_tokens SET used_at = NOW() WHERE client_id = ? AND purpose = 'setup' AND used_at IS NULL")
        ->execute([$clientId]);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    http_response_code(500);
    exit(json_encode(['error' => 'Could not set your password. Please try again.']));
}

$now   = time();
$jwt   = client_jwt_encode(['client_id' => $clientId, 'type' => 'client', 'iat' => $now, 'exp' => $now + CLIENT_JWT_EXPIRY]);

$refreshToken = bin2hex(random_bytes(32));
$expiresAt    = (new DateTimeImmutable('+' . REFRESH_DAYS . ' days'))->format('Y-m-d H:i:s');
$pdo->prepare('INSERT INTO client_refresh_tokens (client_id, token_hash, expires_at) VALUES (?, ?, ?)')
    ->execute([$clientId, hash('sha256', $refreshToken), $expiresAt]);

echo json_encode([
    'token'        => $jwt,
    'refreshToken' => $refreshToken,
    'client'       => ['id' => $clientId, 'name' => $row['name'], 'email' => $row['email']],
]);
