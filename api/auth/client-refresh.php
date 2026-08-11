<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/validate.php';

const REFRESH_DAYS = 30;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body = jsonBody();
requireFields($body, ['refreshToken']);
$hash = hash('sha256', (string)$body['refreshToken']);

$pdo  = getPDO();
$stmt = $pdo->prepare('SELECT * FROM client_refresh_tokens WHERE token_hash = ? AND expires_at > NOW()');
$stmt->execute([$hash]);
$row = $stmt->fetch();
if (!$row) { http_response_code(401); exit(json_encode(['error' => 'Refresh token expired or invalid'])); }

$stmt = $pdo->prepare('SELECT * FROM clients WHERE id = ? AND is_active = 1');
$stmt->execute([$row['client_id']]);
$client = $stmt->fetch();
if (!$client) { http_response_code(401); exit(json_encode(['error' => 'Account not active'])); }

// Rotate: delete the old row, issue a new refresh token.
$pdo->prepare('DELETE FROM client_refresh_tokens WHERE id = ?')->execute([$row['id']]);

$now   = time();
$token = client_jwt_encode(['client_id' => (int)$client['id'], 'type' => 'client', 'iat' => $now, 'exp' => $now + CLIENT_JWT_EXPIRY]);

$newRefreshToken = bin2hex(random_bytes(32));
$expiresAt       = (new DateTimeImmutable('+' . REFRESH_DAYS . ' days'))->format('Y-m-d H:i:s');
$pdo->prepare('INSERT INTO client_refresh_tokens (client_id, token_hash, expires_at) VALUES (?, ?, ?)')
    ->execute([$client['id'], hash('sha256', $newRefreshToken), $expiresAt]);

echo json_encode(['token' => $token, 'refreshToken' => $newRefreshToken]);
