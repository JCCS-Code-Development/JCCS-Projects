<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

$auth = requireAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') { http_response_code(405); exit; }

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

$pdo  = getPDO();
$stmt = $pdo->prepare('SELECT id FROM notifications WHERE id = ? AND recipient_type = ? AND recipient_id = ?');
$stmt->execute([$id, 'staff', $auth['user_id']]);
if (!$stmt->fetch()) { http_response_code(404); exit(json_encode(['error' => 'Notification not found'])); }

$pdo->prepare("UPDATE notifications SET status = 'resolved', resolved_at = NOW() WHERE id = ?")->execute([$id]);
echo json_encode(['message' => 'Notification resolved']);
