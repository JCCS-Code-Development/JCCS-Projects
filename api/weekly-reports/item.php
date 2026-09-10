<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Permanently delete a weekly report. Irreversible; admins only. Weekly
// reports have no attachments or child rows, so this is a single delete.
$auth = requireAuth();
requireAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'DELETE') { http_response_code(405); exit; }

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

$stmt = $pdo->prepare('SELECT id FROM weekly_reports WHERE id = ?');
$stmt->execute([$id]);
if (!$stmt->fetch()) { http_response_code(404); exit(json_encode(['error' => 'Weekly report not found'])); }

$pdo->prepare('DELETE FROM weekly_reports WHERE id = ?')->execute([$id]);

echo json_encode(['message' => 'Weekly report permanently deleted']);
