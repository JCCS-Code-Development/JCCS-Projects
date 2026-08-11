<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// No POST here — notifications are only ever created server-side by other
// endpoints (via services/notify.php), never directly by a user.
$auth = requireAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$pdo    = getPDO();
$params = ['staff', $auth['user_id']];
$sql    = 'SELECT * FROM notifications WHERE recipient_type = ? AND recipient_id = ?';

if (in_array($_GET['status'] ?? null, ['pending', 'resolved'], true)) {
    $sql .= ' AND status = ?';
    $params[] = $_GET['status'];
}
$sql .= ' ORDER BY created_at DESC LIMIT 100';

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
echo json_encode(['notifications' => $stmt->fetchAll()]);
