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

// One saved version of a request's site walk + scope (admin only), for the
// history view and "restore this version".
$auth = requireAuth(['admin']);
$pdo  = getPDO();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$s = $pdo->prepare('SELECT * FROM quote_request_versions WHERE id = ?');
$s->execute([(int)($_GET['id'] ?? 0)]);
$v = $s->fetch();
if (!$v) { http_response_code(404); exit(json_encode(['error' => 'Version not found'])); }
$v['form'] = $v['form_json'] ? json_decode($v['form_json'], true) : null;
unset($v['form_json']);
echo json_encode(['version' => $v]);
