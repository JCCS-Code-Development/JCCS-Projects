<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Engineer list (the `customer_contacts` table) — the person a quote is for,
// the company (client list) they work for and the location they work at.
// Field managers and the office can look them up and add or fix one;
// removing is office-only.
//   GET                 active engineers (admins: ?include_inactive=1)
//   POST                add {name, customer_id?, location?, title?, email?, phone?}
//   PATCH  ?id=         edit (admins may also send is_active)
//   DELETE ?id=         deactivate (admin)
$auth   = requireAuth(['admin', 'field']);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$isAdmin = $auth['role'] === 'admin';

const ENGINEER_FIELDS = ['name' => 150, 'title' => 100, 'location' => 200, 'email' => 190, 'phone' => 30];
const ENGINEER_SELECT = 'SELECT e.id, e.name, e.title, e.location, e.email, e.phone, e.customer_id, e.is_active, e.created_by_name, e.updated_at,
                                cu.name AS company
                           FROM customer_contacts e LEFT JOIN customers cu ON cu.id = e.customer_id';

function engineerClean(PDO $pdo, array $body): array {
    $out = [];
    foreach (ENGINEER_FIELDS as $key => $max) {
        if (!array_key_exists($key, $body)) continue;
        $v = preg_replace('/\s+/', ' ', trim((string)($body[$key] ?? '')));
        if ($key === 'email' && $v !== '') {
            $v = strtolower($v);
            if (!filter_var($v, FILTER_VALIDATE_EMAIL)) { http_response_code(422); exit(json_encode(['error' => 'Enter a valid email address'])); }
        }
        $out[$key] = $v === '' ? null : mb_substr($v, 0, $max);
    }
    if (array_key_exists('name', $out) && $out['name'] === null) {
        http_response_code(422); exit(json_encode(['error' => "Engineer's name is required"]));
    }
    if (array_key_exists('customer_id', $body)) {
        $cid = $body['customer_id'] ? (int)$body['customer_id'] : null;
        if ($cid) {
            $c = $pdo->prepare('SELECT id FROM customers WHERE id = ?');
            $c->execute([$cid]);
            if (!$c->fetch()) { http_response_code(422); exit(json_encode(['error' => 'That company is no longer on the client list'])); }
        }
        $out['customer_id'] = $cid;
    }
    return $out;
}

function engineerPresent(array $r): array {
    $r['id'] = (int)$r['id'];
    $r['customer_id'] = $r['customer_id'] !== null ? (int)$r['customer_id'] : null;
    $r['is_active'] = (int)$r['is_active'];
    return $r;
}

function engineerLoad(PDO $pdo, int $id): ?array {
    $s = $pdo->prepare(ENGINEER_SELECT . ' WHERE e.id = ?');
    $s->execute([$id]);
    $r = $s->fetch();
    return $r ? engineerPresent($r) : null;
}

// Same engineer = same name at the same company, ignoring case and extra spaces.
function engineerFindDupe(PDO $pdo, string $name, ?int $customerId): ?array {
    $s = $pdo->prepare('SELECT id FROM customer_contacts WHERE LOWER(TRIM(name)) = ? AND customer_id <=> ? ORDER BY is_active DESC, id LIMIT 1');
    $s->execute([mb_strtolower(preg_replace('/\s+/', ' ', trim($name))), $customerId]);
    $id = $s->fetchColumn();
    return $id === false ? null : engineerLoad($pdo, (int)$id);
}

if ($method === 'GET') {
    $where = !empty($_GET['include_inactive']) && $isAdmin ? '' : 'WHERE e.is_active = 1';
    $rows = $pdo->query(ENGINEER_SELECT . " $where ORDER BY e.name")->fetchAll();
    echo json_encode(['engineers' => array_map('engineerPresent', $rows)]);
    exit;
}

if ($method === 'POST') {
    $data = engineerClean($pdo, jsonBody());
    if (empty($data['name'])) { http_response_code(422); exit(json_encode(['error' => "Engineer's name is required"])); }
    if ($dupe = engineerFindDupe($pdo, $data['name'], $data['customer_id'] ?? null)) {
        if (!$dupe['is_active']) {
            $pdo->prepare('UPDATE customer_contacts SET is_active = 1 WHERE id = ?')->execute([$dupe['id']]);
            $dupe['is_active'] = 1;
        }
        http_response_code(409);
        exit(json_encode(['error' => 'That engineer is already on the list', 'engineer' => $dupe]));
    }
    $data['created_by_name'] = mb_substr((string)$auth['name'], 0, 150);
    $cols = array_keys($data);
    $pdo->prepare('INSERT INTO customer_contacts (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')')
        ->execute(array_values($data));
    echo json_encode(['engineer' => engineerLoad($pdo, (int)$pdo->lastInsertId()), 'message' => 'Engineer added']);
    exit;
}

$id = (int)($_GET['id'] ?? 0);
$row = engineerLoad($pdo, $id);
if (!$row) { http_response_code(404); exit(json_encode(['error' => 'Engineer not found'])); }

if ($method === 'PATCH') {
    $body = jsonBody();
    $data = engineerClean($pdo, $body);
    $name = $data['name'] ?? $row['name'];
    $cid  = array_key_exists('customer_id', $data) ? $data['customer_id'] : $row['customer_id'];
    if (($dupe = engineerFindDupe($pdo, $name, $cid)) && $dupe['id'] !== $id) {
        http_response_code(409); exit(json_encode(['error' => 'That engineer is already on the list at that company']));
    }
    if ($isAdmin && array_key_exists('is_active', $body)) $data['is_active'] = $body['is_active'] ? 1 : 0;
    if ($data) {
        $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($data)));
        $pdo->prepare("UPDATE customer_contacts SET $sets WHERE id = ?")->execute([...array_values($data), $id]);
    }
    echo json_encode(['engineer' => engineerLoad($pdo, $id), 'message' => 'Saved']);
    exit;
}

if ($method === 'DELETE') {
    requireAdmin($auth);
    // Deactivate only: past quotes still point at the engineer.
    $pdo->prepare('UPDATE customer_contacts SET is_active = 0 WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Removed from the list']);
    exit;
}

http_response_code(405);
