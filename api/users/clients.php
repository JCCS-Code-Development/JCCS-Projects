<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Client provisioning — the "local" mirror of users/index.php's FieldClock
// search. There's no external directory to search here (clients aren't
// FieldClock users), so the frontend loads this full list once and
// searches/filters it client-side, same as it does with FieldClock's
// employee list — the difference is entirely in WHERE the search happens,
// not the UX shape. If nothing matches, the same screen lets the admin
// create a brand-new client right there instead of falling back to a raw
// ID field (there's no ID to type — creating IS the fallback).
$auth = requireAuth();
requireAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

function attachClientProjectAccess(PDO $pdo, array $clients): array {
    if (!$clients) return [];
    $ids = array_column($clients, 'id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("SELECT client_id, project_number FROM client_project_access WHERE client_id IN ($placeholders)");
    $stmt->execute($ids);
    $byClient = [];
    foreach ($stmt->fetchAll() as $row) { $byClient[$row['client_id']][] = $row['project_number']; }
    foreach ($clients as &$c) {
        unset($c['password_hash']); // never leave the app's own boundary
        $c['project_numbers'] = $byClient[$c['id']] ?? [];
    }
    return $clients;
}

if ($method === 'GET') {
    $stmt = $pdo->query('SELECT * FROM clients ORDER BY name');
    echo json_encode(['clients' => attachClientProjectAccess($pdo, $stmt->fetchAll())]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['email', 'name', 'password']);

    $email = strtolower(trim((string)$body['email']));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(422); exit(json_encode(['error' => 'Enter a valid email address']));
    }
    if (strlen((string)$body['password']) < 8) {
        http_response_code(422); exit(json_encode(['error' => 'Password must be at least 8 characters']));
    }

    $dupe = $pdo->prepare('SELECT id FROM clients WHERE email = ?');
    $dupe->execute([$email]);
    if ($dupe->fetch()) {
        // The admin should have found this via search instead — but the UI
        // can't guarantee that, so the server has the final say.
        http_response_code(422); exit(json_encode(['error' => 'A client with that email is already registered — search for them instead']));
    }

    $phone = !empty($body['phone']) ? sanitizeString($body['phone']) : null;
    $projectNumbers = is_array($body['project_numbers'] ?? null) ? $body['project_numbers'] : [];

    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO clients (email, phone, password_hash, name) VALUES (?, ?, ?, ?)')
            ->execute([$email, $phone, password_hash((string)$body['password'], PASSWORD_DEFAULT), sanitizeString($body['name'])]);
        $clientId = (int)$pdo->lastInsertId();

        if ($projectNumbers) {
            $accessStmt = $pdo->prepare('INSERT IGNORE INTO client_project_access (client_id, project_number) VALUES (?, ?)');
            foreach ($projectNumbers as $pn) {
                if (preg_match('/^\d{4}$/', $pn)) $accessStmt->execute([$clientId, $pn]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        http_response_code(500); exit(json_encode(['error' => 'Could not save the client']));
    }

    echo json_encode(['id' => $clientId, 'message' => 'Client created']);

} else { http_response_code(405); }
