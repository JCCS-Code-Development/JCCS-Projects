<?php
// Two independent auth paths:
//  - requireAuth()       validates a FieldClock-issued JWT, then resolves the
//                         payload's user_id to this app's own role via
//                         projects_staff_roles — Projects does not trust
//                         FieldClock's `role` claim (employee/admin/contractor)
//                         since Projects' roles (admin/pm) are assigned
//                         independently. Same pattern as Inventory.
//  - requireClientAuth()  validates a Projects-issued client JWT (separate
//                         secret, separate table) and returns which
//                         project_numbers that client may see.

function requireAuth(): array {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!str_starts_with($auth, 'Bearer ')) {
        http_response_code(401);
        exit(json_encode(['error' => 'Unauthorized']));
    }
    $payload = jwt_decode(substr($auth, 7));
    if (!$payload) {
        http_response_code(401);
        exit(json_encode(['error' => 'Token expired or invalid']));
    }

    $pdo  = getPDO();
    $stmt = $pdo->prepare('SELECT * FROM projects_staff_roles WHERE fieldclock_user_id = ? AND is_active = 1');
    $stmt->execute([$payload['user_id']]);
    $access = $stmt->fetch();

    if (!$access) {
        http_response_code(403);
        exit(json_encode(['error' => 'Not provisioned for Projects']));
    }

    return [
        'user_id' => (int)$payload['user_id'],
        'name'    => $access['name'],
        'role'    => $access['role'],
        // The RAW FieldClock bearer token — needed to call jccs-inventory's
        // API server-to-server on this same user's behalf (see
        // services/inventory_client.php). Never persisted, just forwarded.
        'raw_token' => substr($auth, 7),
    ];
}

function requireAdmin(array $auth): void {
    if ($auth['role'] !== 'admin') {
        http_response_code(403);
        exit(json_encode(['error' => 'Forbidden']));
    }
}

// Returns null for admins (unrestricted — sees every project) or an array of
// project_number strings a PM is scoped to. Callers should treat null as
// "no filter" and an empty array as "sees nothing yet."
function pmProjectScope(array $auth): ?array {
    if ($auth['role'] === 'admin') return null;
    $pdo  = getPDO();
    $stmt = $pdo->prepare('SELECT project_number FROM pm_project_access WHERE fieldclock_user_id = ?');
    $stmt->execute([$auth['user_id']]);
    return array_column($stmt->fetchAll(), 'project_number');
}

function requireClientAuth(): array {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!str_starts_with($auth, 'Bearer ')) {
        http_response_code(401);
        exit(json_encode(['error' => 'Unauthorized']));
    }
    $payload = client_jwt_decode(substr($auth, 7));
    if (!$payload || ($payload['type'] ?? null) !== 'client') {
        http_response_code(401);
        exit(json_encode(['error' => 'Token expired or invalid']));
    }

    $pdo  = getPDO();
    $stmt = $pdo->prepare('SELECT * FROM clients WHERE id = ? AND is_active = 1');
    $stmt->execute([$payload['client_id']]);
    $client = $stmt->fetch();
    if (!$client) {
        http_response_code(403);
        exit(json_encode(['error' => 'Account not active']));
    }

    $stmt = $pdo->prepare('SELECT project_number FROM client_project_access WHERE client_id = ?');
    $stmt->execute([$client['id']]);

    return [
        'client_id' => (int)$client['id'],
        'name'      => $client['name'],
        'email'     => $client['email'],
        'projects'  => array_column($stmt->fetchAll(), 'project_number'),
    ];
}
