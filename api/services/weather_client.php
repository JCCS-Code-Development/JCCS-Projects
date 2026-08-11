<?php
require_once __DIR__ . '/geocode_client.php';

// Free, no-API-key current-conditions via Open-Meteo. WMO weather codes are
// a small fixed set — https://open-meteo.com/en/docs — mapped to short
// human labels here rather than pulled in as a dependency.
const WMO_CONDITIONS = [
    0 => 'Clear sky', 1 => 'Mainly clear', 2 => 'Partly cloudy', 3 => 'Overcast',
    45 => 'Fog', 48 => 'Depositing rime fog',
    51 => 'Light drizzle', 53 => 'Moderate drizzle', 55 => 'Dense drizzle',
    56 => 'Light freezing drizzle', 57 => 'Dense freezing drizzle',
    61 => 'Slight rain', 63 => 'Moderate rain', 65 => 'Heavy rain',
    66 => 'Light freezing rain', 67 => 'Heavy freezing rain',
    71 => 'Slight snow', 73 => 'Moderate snow', 75 => 'Heavy snow', 77 => 'Snow grains',
    80 => 'Slight rain showers', 81 => 'Moderate rain showers', 82 => 'Violent rain showers',
    85 => 'Slight snow showers', 86 => 'Heavy snow showers',
    95 => 'Thunderstorm', 96 => 'Thunderstorm with hail', 99 => 'Thunderstorm with heavy hail',
];

function fetchCurrentWeather(float $lat, float $lon): ?string {
    $url = 'https://api.open-meteo.com/v1/forecast?' . http_build_query([
        'latitude'          => $lat,
        'longitude'         => $lon,
        'current_weather'   => 'true',
        'temperature_unit'  => 'fahrenheit',
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 6,
    ]);
    $response = curl_exec($ch);

    if ($response === false) return null;
    $data = json_decode($response, true);
    $cw   = $data['current_weather'] ?? null;
    if (!$cw) return null;

    $temp = (int)round($cw['temperature']);
    $cond = WMO_CONDITIONS[$cw['weathercode']] ?? null;
    return $cond ? "{$temp}°F, {$cond}" : "{$temp}°F";
}

// Geocodes-if-needed (caching lat/lon on project_cache) then fetches current
// conditions for that point. Every failure path returns null rather than
// throwing — weather is best-effort and must never block saving a daily
// log, unlike the photo requirement.
function getProjectWeather(PDO $pdo, string $projectNumber): ?string {
    $stmt = $pdo->prepare('SELECT client_address, latitude, longitude FROM project_cache WHERE project_number = ?');
    $stmt->execute([$projectNumber]);
    $row = $stmt->fetch();
    if (!$row) return null;

    $lat = $row['latitude'];
    $lon = $row['longitude'];

    if ($lat === null || $lon === null) {
        if (empty($row['client_address'])) return null;
        $coords = geocodeAddress($row['client_address']);
        if (!$coords) return null;
        $pdo->prepare('UPDATE project_cache SET latitude = ?, longitude = ?, geocoded_at = NOW() WHERE project_number = ?')
            ->execute([$coords['lat'], $coords['lon'], $projectNumber]);
        $lat = $coords['lat'];
        $lon = $coords['lon'];
    }

    return fetchCurrentWeather((float)$lat, (float)$lon);
}
