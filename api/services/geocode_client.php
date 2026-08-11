<?php
// Free, no-API-key geocoding via the U.S. Census Bureau's public geocoder —
// a good fit since every JCCS project address is a US street address. Only
// called once per project; the result is cached in project_cache and never
// re-fetched unless those columns are still NULL.

function geocodeAddress(string $address): ?array {
    $url = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?' . http_build_query([
        'address'   => $address,
        'benchmark' => 'Public_AR_Current',
        'format'    => 'json',
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 6,
    ]);
    $response = curl_exec($ch);
    // No curl_close() — a no-op since PHP 8.0, and PHP 8.5 deprecates it
    // (see services/inventory_client.php for the same note).

    if ($response === false) return null;
    $data  = json_decode($response, true);
    $match = $data['result']['addressMatches'][0] ?? null;
    if (!$match) return null;

    return [
        'lat' => (float)$match['coordinates']['y'],
        'lon' => (float)$match['coordinates']['x'],
    ];
}
