<?php
// Two independent HS256 schemes, deliberately kept apart:
//  - jwt_decode()         verifies tokens issued by FieldClock (staff), using
//                          JWT_SECRET copied verbatim from FieldClock's config.
//  - client_jwt_encode/decode() issue and verify Projects' OWN client-portal
//                          tokens, using CLIENT_JWT_SECRET. A token signed
//                          with one secret will never validate against the
//                          other, so a client token can't be replayed as a
//                          staff token or vice versa.

function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/'));
}

function jwt_decode(string $token): array|false {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return false;
    [$h, $b, $s] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', "$h.$b", JWT_SECRET, true));
    if (!hash_equals($expected, $s)) return false;
    $payload = json_decode(base64url_decode($b), true);
    if (!$payload || $payload['exp'] < time()) return false;
    return $payload;
}

function client_jwt_encode(array $payload): string {
    $header = base64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $body   = base64url_encode(json_encode($payload));
    $sig    = base64url_encode(hash_hmac('sha256', "$header.$body", CLIENT_JWT_SECRET, true));
    return "$header.$body.$sig";
}

function client_jwt_decode(string $token): array|false {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return false;
    [$h, $b, $s] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', "$h.$b", CLIENT_JWT_SECRET, true));
    if (!hash_equals($expected, $s)) return false;
    $payload = json_decode(base64url_decode($b), true);
    if (!$payload || $payload['exp'] < time()) return false;
    return $payload;
}
