<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Customers (organizations) + their contacts. Admins manage the list; field
// managers can read it so a site walk can be tied to the right customer.
$auth   = requireAuth(['admin', 'field']);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

function customerFields(array $body, array &$sets, array &$params, array $keys): void {
    foreach ($keys as $key => $max) {
        if (!array_key_exists($key, $body)) continue;
        $v = sanitizeString($body[$key] ?? '');
        $sets[] = "$key = ?"; $params[] = $v === '' ? null : mb_substr($v, 0, $max);
    }
}
const CUSTOMER_KEYS = ['phone' => 30, 'email' => 190, 'address' => 255, 'notes' => 5000];

if ($method === 'GET') {
    $where = !empty($_GET['include_inactive']) && $auth['role'] === 'admin' ? '' : 'WHERE is_active = 1';
    $customers = $pdo->query("SELECT * FROM customers $where ORDER BY name")->fetchAll();
    $contacts  = $pdo->query('SELECT * FROM customer_contacts WHERE is_active = 1 ORDER BY name')->fetchAll();
    $byCustomer = [];
    foreach ($contacts as $c) { $c['id'] = (int)$c['id']; $byCustomer[$c['customer_id']][] = $c; }
    foreach ($customers as &$c) {
        $c['id'] = (int)$c['id'];
        $c['is_active'] = (int)$c['is_active'];
        $c['contacts'] = $byCustomer[$c['id']] ?? [];
        if ($auth['role'] !== 'admin') unset($c['notes']);
    }
    echo json_encode(['customers' => $customers]);

} elseif ($method === 'POST') {
    requireAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['name']);
    $name = mb_substr(sanitizeString($body['name']), 0, 150);
    $dupe = $pdo->prepare('SELECT id FROM customers WHERE name = ? AND is_active = 1');
    $dupe->execute([$name]);
    if ($dupe->fetch()) { http_response_code(422); exit(json_encode(['error' => 'A customer with that name already exists'])); }

    $sets = ['name = ?']; $params = [$name];
    customerFields($body, $sets, $params, CUSTOMER_KEYS);
    $cols = array_map(fn($s) => substr($s, 0, strpos($s, ' ')), $sets);
    $pdo->prepare('INSERT INTO customers (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')')->execute($params);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Customer added']);

} else { http_response_code(405); }
