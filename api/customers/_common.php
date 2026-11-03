<?php
// Client list (the `customers` table) — who a job is for (often a person,
// e.g. an engineer), the company they work for and the location they work
// at, with the details InvoiceToGo keeps. Not the same as portal client users.

const CUSTOMER_FIELDS = [
    'name' => 150, 'contact_name' => 150, 'company' => 150, 'location' => 200, 'email' => 190, 'phone' => 30, 'mobile' => 30,
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

// Keeps the client list in step with InvoiceToGo: InvoiceToGo sends each
// estimate / invoice TO the client, so the depot copy's To: line is the
// client as InvoiceToGo has them. Finds them by email (then by name, filling
// in a missing email) or adds them. Returns the client id, or null when the
// address isn't a client (our own, InvoiceToGo's). Never exits — safe for cron.
const CUSTOMER_NOT_CLIENT_DOMAINS = ['jccs-services.com', 'projects.jccs-services.com', 'invoice2go.com', 'invoicetogo.com'];

function customerSyncFromEmail(PDO $pdo, string $email, ?string $name, string $source = 'InvoiceToGo (depot)'): ?int {
    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return null;
    $domain = substr($email, strrpos($email, '@') + 1);
    foreach (CUSTOMER_NOT_CLIENT_DOMAINS as $d) if ($domain === $d || str_ends_with($domain, '.' . $d)) return null;
    $name = trim(preg_replace('/\s+/', ' ', (string) $name), " \t\"'");
    if ($name === '' || filter_var($name, FILTER_VALIDATE_EMAIL)) $name = $email;

    $s = $pdo->prepare('SELECT id, is_active FROM customers WHERE LOWER(email) = ? ORDER BY is_active DESC, id LIMIT 1');
    $s->execute([$email]);
    if ($row = $s->fetch()) return (int) $row['id'];

    if ($name !== $email && ($byName = customerFindByName($pdo, $name))) {
        if (empty($byName['email'])) $pdo->prepare('UPDATE customers SET email = ? WHERE id = ?')->execute([$email, $byName['id']]);
        return (int) $byName['id'];
    }
    $pdo->prepare('INSERT INTO customers (name, email, created_by_name) VALUES (?, ?, ?)')
        ->execute([mb_substr($name, 0, 150), mb_substr($email, 0, 190), $source]);
    return (int) $pdo->lastInsertId();
}

// The To / Cc people on an email (imap_headerinfo), as [email, name] pairs.
function customerAddressesOf($header): array {
    $out = [];
    foreach (['to', 'cc'] as $k) {
        foreach (is_array($header->$k ?? null) ? $header->$k : [] as $a) {
            if (empty($a->mailbox) || empty($a->host)) continue;
            $name = isset($a->personal) ? (function_exists('imap_utf8') ? imap_utf8($a->personal) : mb_decode_mimeheader($a->personal)) : null;
            $out[] = [$a->mailbox . '@' . $a->host, $name];
        }
    }
    return $out;
}
