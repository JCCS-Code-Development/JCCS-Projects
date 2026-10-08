<?php
// Server-to-server calls to jccs-calendar's API, for no-PO jobs: scheduling
// one puts it on the Calendar, marking it done completes the event, and
// cancelling / unscheduling removes it. Like inventory_client.php this is a
// PHP cURL call (no CORS involved) and forwards the SAME FieldClock-issued
// bearer token the current request carried, so Calendar applies its own
// permissions (creating/editing events needs a Calendar Admin/Office role;
// marking done works for anyone on the Calendar).
//
// Everything here is best-effort: a Calendar failure never undoes the change
// in Projects — it comes back as a message the office sees on the request.

if (!defined('CALENDAR_API_URL')) define('CALENDAR_API_URL', 'https://calendar.jccs-services.com/api');

const QR_CALENDAR_EVENT_TYPE = 'Site Visit';
const QR_CALENDAR_SUBTYPE    = 'Job Set-Up';

function calendarRequest(string $method, string $path, string $bearerToken, ?array $body = null): array {
    $ch = curl_init(rtrim(CALENDAR_API_URL, '/') . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $bearerToken, 'Content-Type: application/json'],
        CURLOPT_TIMEOUT        => 8,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $response = curl_exec($ch);
    $status   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if (curl_errno($ch) || $response === false) {
        return ['status' => 502, 'data' => ['error' => 'Could not reach the Calendar']];
    }
    return ['status' => $status, 'data' => json_decode($response, true) ?? []];
}

// "Calendar said no" in words the office can act on. $what: what didn't
// happen there ("add this job to", "update", "mark this job done on", …).
function calendarError(array $res, string $what = 'update'): string {
    $msg = $res['data']['error'] ?? null;
    if ($res['status'] === 403) {
        $why = $msg === 'Not provisioned for Calendar'
            ? 'you’re not set up on the Calendar app'
            : 'your Calendar account can’t edit events';
        return "Couldn’t {$what} the Calendar — {$why}.";
    }
    return "Couldn’t {$what} the Calendar" . ($msg ? " ({$msg})" : " (error {$res['status']})") . '.';
}

function calendarEventPayload(array $row): array {
    $where = trim(implode(' — ', array_filter([$row['facility'] ?? '', $row['location_detail'] ?? ''])));
    $no    = qrRequestNo($row['quote_number'] ?? null);
    $desc  = trim(implode("\n\n", array_filter([
        'No PO — invoice when done.',
        $row['description'] ?? '',
        rtrim(defined('FRONTEND_ORIGIN') ? FRONTEND_ORIGIN : '', '/') . '/quotes/' . $row['id'],
    ])));
    return [
        'title'            => mb_substr(($no ? "{$no} · " : '') . $row['title'], 0, 255),
        'event_subtype'    => QR_CALENDAR_SUBTYPE,
        'description'      => mb_substr($desc, 0, 5000),
        'location'         => $where !== '' ? mb_substr($where, 0, 255) : null,
        'start_datetime'   => $row['scheduled_start'],
        'end_datetime'     => $row['scheduled_end'] ?: null,
        'is_all_day'       => 0,
        'assigned_user_id' => !empty($row['field_manager_id']) ? (int)$row['field_manager_id'] : null,
        'details'          => ['source' => 'projects', 'quote_request_id' => (int)$row['id']],
    ];
}

// Create or update the job's Calendar event. Returns [eventId|null, error|null].
function calendarSaveJob(string $token, array $row): array {
    $payload = calendarEventPayload($row);
    $eventId = !empty($row['calendar_event_id']) ? (int)$row['calendar_event_id'] : null;

    if ($eventId) {
        $res = calendarRequest('PUT', "/events/{$eventId}", $token, $payload);
        if ($res['status'] === 200) return [$eventId, null];
        if ($res['status'] !== 404) {
            // Field manager not on the Calendar → keep the event unassigned.
            if ($res['status'] >= 500 && $payload['assigned_user_id']) {
                $res = calendarRequest('PUT', "/events/{$eventId}", $token, ['assigned_user_id' => null] + $payload);
                if ($res['status'] === 200) return [$eventId, null];
            }
            return [$eventId, calendarError($res, 'update this job on')];
        }
        // Deleted on the Calendar side — make a new one.
    }

    $types = calendarRequest('GET', '/event-types', $token);
    if ($types['status'] !== 200) return [null, calendarError($types, 'add this job to')];
    $typeId = null;
    foreach ($types['data'] as $t) if (strcasecmp($t['name'] ?? '', QR_CALENDAR_EVENT_TYPE) === 0) $typeId = (int)$t['id'];
    if (!$typeId) return [null, 'Calendar has no "' . QR_CALENDAR_EVENT_TYPE . '" event type'];

    $payload['event_type_id'] = $typeId;
    $res = calendarRequest('POST', '/events', $token, $payload);
    if ($res['status'] >= 500 && $payload['assigned_user_id']) {
        $res = calendarRequest('POST', '/events', $token, ['assigned_user_id' => null] + $payload);
    }
    if ($res['status'] === 201 && !empty($res['data']['id'])) return [(int)$res['data']['id'], null];
    return [null, calendarError($res, 'add this job to')];
}

// Mark the event completed (or back to scheduled). Calendar's mark-done is a
// toggle, so look first and only flip it if it isn't already right.
function calendarSetDone(string $token, int $eventId, bool $done): ?string {
    $res = calendarRequest('GET', "/events/{$eventId}", $token);
    if ($res['status'] === 404) return null; // gone from the Calendar — nothing to do
    $what = $done ? 'mark this job done on' : 'update';
    if ($res['status'] !== 200) return calendarError($res, $what);
    $isDone = strcasecmp($res['data']['status'] ?? '', 'Completed') === 0;
    if ($isDone === $done) return null;
    $res = calendarRequest('PATCH', "/events/{$eventId}/mark-done", $token);
    return $res['status'] === 200 ? null : calendarError($res, $what);
}

function calendarDeleteJob(string $token, int $eventId): ?string {
    $res = calendarRequest('DELETE', "/events/{$eventId}", $token);
    return in_array($res['status'], [200, 404], true) ? null : calendarError($res, 'remove this job from');
}
