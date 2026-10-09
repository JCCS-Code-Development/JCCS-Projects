<?php
// Client list (the `customers` table) — who a job is for, with the details
// InvoiceToGo keeps for a client. Not the same thing as portal client users.

const CUSTOMER_FIELDS = [
    'name' => 150, 'contact_name' => 150, 'email' => 190, 'phone' => 30, 'mobile' => 30,
    'address' => 500, 'ship_address' => 500, 'notes' => 5000,
];

// Cleans the client fields present in $body. Multi-line values (addresses,
// notes) keep their line breaks; everything else is one line.
function customerClean(array $body): array {
    $out = [];
    foreach (CUSTOMER_FIELDS as $key => $max) {
        if (!array_key_exists($key, $body)) continue;
        $v = str_replace("\r\n", "\n", trim((string)($body[$key] ?? '')));
        if (!in_array($key, ['address', 'ship_address', 'notes'], true)) $v = preg_replace('/\s+/', ' ', $v);
        else $v = preg_replace("/\n{3,}/", "\n\n", $v);
        if ($key === 'email' && $v !== '') {
            $v = strtolower($v);
            if (!filter_var($v, FILTER_VALIDATE_EMAIL)) { http_response_code(422); exit(json_encode(['error' => 'Enter a valid email address'])); }
        }
        $out[$key] = $v === '' ? null : mb_substr($v, 0, $max);
    }
    if (array_key_exists('name', $out) && $out['name'] === null) {
        http_response_code(422); exit(json_encode(['error' => 'Client name is required']));
    }
    return $out;
}

function customerPresent(array $r): array {
    $r['id'] = (int)$r['id'];
    $r['is_active'] = (int)$r['is_active'];
    return $r;
}

// Same client = same name, ignoring case and extra spaces.
function customerFindByName(PDO $pdo, string $name): ?array {
    $s = $pdo->prepare('SELECT * FROM customers WHERE LOWER(TRIM(name)) = ? ORDER BY is_active DESC, id LIMIT 1');
    $s->execute([mb_strtolower(preg_replace('/\s+/', ' ', trim($name)))]);
    return $s->fetch() ?: null;
}
