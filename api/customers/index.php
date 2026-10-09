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

// Client list. Field managers and the office can look clients up and add or
// fix one from a site visit; removing is office-only.
//   GET                 active clients (admins: ?include_inactive=1)
//   POST                add {name, contact_name?, email?, phone?, mobile?, address?, ship_address?, notes?}
//   PATCH  ?id=         edit (admins may also send is_active)
//   DELETE ?id=         deactivate (admin)
$auth   = requireAuth(['admin', 'field']);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$isAdmin = $auth['role'] === 'admin';

if ($method === 'GET') {
    $where = !empty($_GET['include_inactive']) && $isAdmin ? '' : 'WHERE is_active = 1';
    $rows = $pdo->query("SELECT id, name, contact_name, email, phone, mobile, address, ship_address, notes, is_active, created_by_name, updated_at
                           FROM customers $where ORDER BY name")->fetchAll();
    echo json_encode(['clients' => array_map('customerPresent', $rows)]);
    exit;
}

if ($method === 'POST') {
    $data = customerClean(jsonBody());
    if (empty($data['name'])) { http_response_code(422); exit(json_encode(['error' => 'Client name is required'])); }
    if ($dupe = customerFindByName($pdo, $data['name'])) {
        if (!(int)$dupe['is_active']) {
            $pdo->prepare('UPDATE customers SET is_active = 1 WHERE id = ?')->execute([$dupe['id']]);
            $dupe['is_active'] = 1;
        }
        http_response_code(409);
        exit(json_encode(['error' => 'That client is already on the list', 'client' => customerPresent($dupe)]));
    }
    $data['created_by_name'] = mb_substr((string)$auth['name'], 0, 150);
    $cols = array_keys($data);
    $pdo->prepare('INSERT INTO customers (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')')
        ->execute(array_values($data));
    $s = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
    $s->execute([(int)$pdo->lastInsertId()]);
    echo json_encode(['client' => customerPresent($s->fetch()), 'message' => 'Client added']);
    exit;
}

$id = (int)($_GET['id'] ?? 0);
$s = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
$s->execute([$id]);
$row = $s->fetch();
if (!$row) { http_response_code(404); exit(json_encode(['error' => 'Client not found'])); }

if ($method === 'PATCH') {
    $body = jsonBody();
    $data = customerClean($body);
    if (!empty($data['name']) && ($dupe = customerFindByName($pdo, $data['name'])) && (int)$dupe['id'] !== $id) {
        http_response_code(409); exit(json_encode(['error' => 'Another client already has that name']));
    }
    if ($isAdmin && array_key_exists('is_active', $body)) $data['is_active'] = $body['is_active'] ? 1 : 0;
    if ($data) {
        $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($data)));
        $pdo->prepare("UPDATE customers SET $sets WHERE id = ?")->execute([...array_values($data), $id]);
    }
    $s->execute([$id]);
    echo json_encode(['client' => customerPresent($s->fetch()), 'message' => 'Saved']);
    exit;
}

if ($method === 'DELETE') {
    requireAdmin($auth);
    // Deactivate only: past site visits still point at the client.
    $pdo->prepare('UPDATE customers SET is_active = 0 WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Removed from the list']);
    exit;
}

http_response_code(405);
