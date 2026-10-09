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

// Bulk import from an InvoiceToGo export. The browser reads the CSV and sends
// {clients: [{name, contact_name, email, ...}, ...]}. A client already on the
// list (same name) only gets its EMPTY fields filled in — nothing typed in
// the app is overwritten — and comes back if it had been removed.
$auth = requireAuth(['admin']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$pdo  = getPDO();
$list = jsonBody()['clients'] ?? null;
if (!is_array($list) || !$list) { http_response_code(422); exit(json_encode(['error' => 'No clients to import'])); }
if (count($list) > 5000) { http_response_code(422); exit(json_encode(['error' => 'Too many rows — import at most 5,000 clients at a time'])); }

$added = 0; $updated = 0; $skipped = [];
$pdo->beginTransaction();
try {
    foreach ($list as $i => $raw) {
        if (!is_array($raw)) continue;
        $raw = array_intersect_key($raw, CUSTOMER_FIELDS);
        if (trim((string)($raw['name'] ?? '')) === '') continue;
        // A bad email shouldn't sink the whole import — drop just that field.
        if (!filter_var(strtolower(trim((string)($raw['email'] ?? ''))), FILTER_VALIDATE_EMAIL)) unset($raw['email']);
        $data = customerClean($raw);

        $existing = customerFindByName($pdo, $data['name']);
        if (!$existing) {
            $data['created_by_name'] = 'InvoiceToGo import';
            $cols = array_keys($data);
            $pdo->prepare('INSERT INTO customers (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')')
                ->execute(array_values($data));
            $added++;
            continue;
        }
        $fill = [];
        foreach ($data as $k => $v) {
            if ($k !== 'name' && $v !== null && ($existing[$k] ?? null) === null) $fill[$k] = $v;
        }
        if (!(int)$existing['is_active']) $fill['is_active'] = 1;
        if ($fill) {
            $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($fill)));
            $pdo->prepare("UPDATE customers SET $sets WHERE id = ?")->execute([...array_values($fill), $existing['id']]);
            $updated++;
        } else {
            $skipped[] = $data['name'];
        }
    }
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}

echo json_encode(['added' => $added, 'updated' => $updated, 'unchanged' => count($skipped)]);
