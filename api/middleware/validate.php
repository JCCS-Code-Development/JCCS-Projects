<?php
function jsonBody(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

function requireFields(array $body, array $fields): void {
    foreach ($fields as $field) {
        if (!isset($body[$field]) || $body[$field] === '') {
            http_response_code(422);
            exit(json_encode(['error' => "Missing required field: $field"]));
        }
    }
}

// Trim only — no htmlspecialchars(). This is a JSON API consumed by a React
// SPA that renders values as text nodes (`{value}` in JSX), which already
// escapes on render; HTML-encoding here too just means the entities show up
// LITERALLY on screen ("Fence &amp; Gate" instead of "Fence & Gate") since
// nothing ever decodes them back. Storage is via prepared statements, so
// there's no SQL-injection reason to encode here either.
function sanitizeString(mixed $val): string {
    return trim((string)$val);
}
