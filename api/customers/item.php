<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Admin-only edits to one customer (?id=) and its contacts.
//   PATCH  ?id=                 update customer fields / is_active
//   POST   ?id=&contact=new     add a contact
//   PATCH  ?id=&contact=<cid>   update a contact
//   DELETE ?id=&contact=<cid>   deactivate a contact (kept for old requests)
//   DELETE ?id=                 deactivate the customer
$auth = requireAuth(['admin']);
$pdo  = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$id = (int)($_GET['id'] ?? 0);

$s = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
$s->execute([$id]);
$customer = $s->fetch();
if (!$customer) { http_response_code(404); exit(json_encode(['error' => 'Customer not found'])); }

function setStrings(array $body, array $keys, array &$sets, array &$params): void {
    foreach ($keys as $key => $max) {
        if (!array_key_exists($key, $body)) continue;
        $v = sanitizeString($body[$key] ?? '');
        $sets[] = "$key = ?"; $params[] = $v === '' ? null : mb_substr($v, 0, $max);
    }
}
const CONTACT_KEYS = ['title' => 100, 'email' => 190, 'phone' => 30, 'address' => 255];

$contactParam = $_GET['contact'] ?? null;

if ($contactParam !== null) {
    if ($method === 'POST' && $contactParam === 'new') {
        $body = jsonBody();
        requireFields($body, ['name']);
        $sets = ['customer_id = ?', 'name = ?']; $params = [$id, mb_substr(sanitizeString($body['name']), 0, 150)];
        setStrings($body, CONTACT_KEYS, $sets, $params);
        $cols = array_map(fn($x) => substr($x, 0, strpos($x, ' ')), $sets);
        $pdo->prepare('INSERT INTO customer_contacts (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')')->execute($params);
        echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Contact added']);
        exit;
    }
    $cid = (int)$contactParam;
    $s = $pdo->prepare('SELECT * FROM customer_contacts WHERE id = ? AND customer_id = ?');
    $s->execute([$cid, $id]);
    if (!$s->fetch()) { http_response_code(404); exit(json_encode(['error' => 'Contact not found'])); }

    if ($method === 'PATCH') {
        $body = jsonBody();
        $sets = []; $params = [];
        if (array_key_exists('name', $body)) {
            $n = sanitizeString($body['name']);
            if ($n === '') { http_response_code(422); exit(json_encode(['error' => 'Contact name is required'])); }
            $sets[] = 'name = ?'; $params[] = mb_substr($n, 0, 150);
        }
        setStrings($body, CONTACT_KEYS, $sets, $params);
        if ($sets) { $params[] = $cid; $pdo->prepare('UPDATE customer_contacts SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params); }
        echo json_encode(['message' => 'Saved']);
    } elseif ($method === 'DELETE') {
        $pdo->prepare('UPDATE customer_contacts SET is_active = 0 WHERE id = ?')->execute([$cid]);
        echo json_encode(['message' => 'Contact removed']);
    } else { http_response_code(405); }
    exit;
}

if ($method === 'PATCH') {
    $body = jsonBody();
    $sets = []; $params = [];
    if (array_key_exists('name', $body)) {
        $n = sanitizeString($body['name']);
        if ($n === '') { http_response_code(422); exit(json_encode(['error' => 'Customer name is required'])); }
        $sets[] = 'name = ?'; $params[] = mb_substr($n, 0, 150);
    }
    setStrings($body, ['phone' => 30, 'email' => 190, 'address' => 255, 'notes' => 5000], $sets, $params);
    if (array_key_exists('is_active', $body)) { $sets[] = 'is_active = ?'; $params[] = $body['is_active'] ? 1 : 0; }
    if ($sets) { $params[] = $id; $pdo->prepare('UPDATE customers SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params); }
    echo json_encode(['message' => 'Saved']);
} elseif ($method === 'DELETE') {
    // Soft delete — old quote requests still point at this customer.
    $pdo->prepare('UPDATE customers SET is_active = 0 WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Customer removed']);
} else { http_response_code(405); }
