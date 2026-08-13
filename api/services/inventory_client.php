<?php
// Server-to-server proxy to jccs-inventory's Projects API. This is a PHP
// cURL call, not a browser request — CORS is a browser-only mechanism, so
// this needs zero changes to jccs-inventory's cors.php allowlist. It
// authenticates using the SAME FieldClock-issued bearer token the current
// staff request carried, since inventory's GET /projects endpoints accept
// any valid FieldClock-issued JWT.

function inventoryRequest(string $method, string $path, string $bearerToken, ?array $body = null): array {
    $ch = curl_init(rtrim(INVENTORY_API_URL, '/') . $path);
    $headers = ['Authorization: Bearer ' . $bearerToken, 'Content-Type: application/json'];

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 8,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }

    $response = curl_exec($ch);
    $status   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $errno    = curl_errno($ch);
    // No curl_close() — a no-op since PHP 8.0 (handles are freed automatically),
    // and PHP 8.5 emits a deprecation notice for it that our strict error
    // handler upgrades into a thrown exception.

    if ($errno || $response === false) {
        return ['status' => 502, 'data' => ['error' => 'Could not reach the Projects registry']];
    }
    return ['status' => $status, 'data' => json_decode($response, true) ?? []];
}

function inventoryListProjects(string $bearerToken): array {
    return inventoryRequest('GET', '/projects/index.php', $bearerToken);
}

function inventoryResolveProject(string $bearerToken, string $projectNumber): array {
    return inventoryRequest('POST', '/projects/resolve.php', $bearerToken, ['project_number' => $projectNumber]);
}

// Full project creation (name + client fields) — Inventory itself gates this
// to ITS OWN admins (requireInventoryAdmin), independent of whether the
// caller is a Projects admin. A Projects admin who isn't also an Inventory
// admin will get a 403 back from Inventory, passed straight through.
function inventoryCreateProject(string $bearerToken, array $fields): array {
    return inventoryRequest('POST', '/projects/index.php', $bearerToken, $fields);
}
