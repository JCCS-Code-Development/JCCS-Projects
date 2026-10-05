<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Materials / finishes library — the one-tap picks on the site-walk form.
// GET is open to field managers; changes are admin-only.
//   GET                       active entries (admins: ?include_inactive=1)
//   POST                      add {kind, label, manufacturer?, product_code?, notes?}
//   PATCH  ?id=               edit / is_active
//   DELETE ?id=               deactivate
const LIBRARY_KINDS = ['paint_color', 'laminate', 'solid_surface', 'flooring', 'cove_base', 'film', 'ceiling_tile', 'wall_protection', 'other'];

$auth   = requireAuth(['admin', 'field']);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

function libraryStrings(array $body, array &$sets, array &$params): void {
    foreach (['manufacturer' => 100, 'product_code' => 60, 'notes' => 255] as $key => $max) {
        if (!array_key_exists($key, $body)) continue;
        $v = sanitizeString($body[$key] ?? '');
        $sets[] = "$key = ?"; $params[] = $v === '' ? null : mb_substr($v, 0, $max);
    }
}

if ($method === 'GET') {
    $where = !empty($_GET['include_inactive']) && $auth['role'] === 'admin' ? '' : 'WHERE is_active = 1';
    $rows = $pdo->query("SELECT * FROM quote_library $where ORDER BY kind, use_count DESC, label")->fetchAll();
    foreach ($rows as &$r) { $r['id'] = (int)$r['id']; $r['is_active'] = (int)$r['is_active']; $r['use_count'] = (int)$r['use_count']; }
    echo json_encode(['items' => $rows, 'kinds' => LIBRARY_KINDS]);
    exit;
}

requireAdmin($auth);
$body = $method === 'DELETE' ? [] : jsonBody();

if ($method === 'POST') {
    requireFields($body, ['kind', 'label']);
    if (!in_array($body['kind'], LIBRARY_KINDS, true)) { http_response_code(422); exit(json_encode(['error' => 'Unknown material type'])); }
    $label = mb_substr(sanitizeString($body['label']), 0, 150);
    $sets = ['kind = ?', 'label = ?']; $params = [$body['kind'], $label];
    libraryStrings($body, $sets, $params);
    $cols = array_map(fn($s) => substr($s, 0, strpos($s, ' ')), $sets);
    try {
        $pdo->prepare('INSERT INTO quote_library (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')')->execute($params);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            // Re-adding a deactivated entry just brings it back.
            $pdo->prepare('UPDATE quote_library SET is_active = 1 WHERE kind = ? AND label = ?')->execute([$body['kind'], $label]);
            echo json_encode(['message' => 'Already in the library — restored']); exit;
        }
        throw $e;
    }
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Added']);
    exit;
}

$id = (int)($_GET['id'] ?? 0);
$s = $pdo->prepare('SELECT id FROM quote_library WHERE id = ?');
$s->execute([$id]);
if (!$s->fetch()) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }

if ($method === 'PATCH') {
    $sets = []; $params = [];
    if (array_key_exists('label', $body)) {
        $l = sanitizeString($body['label']);
        if ($l === '') { http_response_code(422); exit(json_encode(['error' => 'Name is required'])); }
        $sets[] = 'label = ?'; $params[] = mb_substr($l, 0, 150);
    }
    if (array_key_exists('kind', $body)) {
        if (!in_array($body['kind'], LIBRARY_KINDS, true)) { http_response_code(422); exit(json_encode(['error' => 'Unknown material type'])); }
        $sets[] = 'kind = ?'; $params[] = $body['kind'];
    }
    libraryStrings($body, $sets, $params);
    if (array_key_exists('is_active', $body)) { $sets[] = 'is_active = ?'; $params[] = $body['is_active'] ? 1 : 0; }
    if ($sets) {
        $params[] = $id;
        try { $pdo->prepare('UPDATE quote_library SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params); }
        catch (PDOException $e) {
            if ($e->getCode() === '23000') { http_response_code(422); exit(json_encode(['error' => 'That material is already in the library'])); }
            throw $e;
        }
    }
    echo json_encode(['message' => 'Saved']);
} elseif ($method === 'DELETE') {
    $pdo->prepare('UPDATE quote_library SET is_active = 0 WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Removed']);
} else { http_response_code(405); }
