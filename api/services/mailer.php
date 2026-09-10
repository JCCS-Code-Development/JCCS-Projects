<?php
// Outbound mail for JCCS apps — sends as noreply@jccs-services.com through
// the Microsoft Graph API (application permissions, client-credentials
// flow). One shared app registration ("JCCS Apps — noreply sender"), locked
// to the noreply mailbox by an Exchange ApplicationAccessPolicy. The same
// three GRAPH_* values live in every JCCS app's config.php, exactly like
// JWT_SECRET — this file is portable and carries no app-specific logic.
//
// Every caller treats this as fire-and-forget: the return value is logged,
// never allowed to block the request that triggered it. If GRAPH_CLIENT_ID
// isn't configured — e.g. local dev, where config.php has no Graph
// credentials — sendEmail() silently no-ops instead of erroring. Every send
// (attempted or not) is appended to mail_outbox.log, so local testing can
// still see exactly what would have gone out and production keeps a
// lightweight audit trail.

// Client-credentials access token for Graph. Cached for the lifetime of the
// PHP process so a notify loop over many recipients (or a digest run)
// reuses one token instead of re-authenticating per message.
function graphAccessToken(): ?string {
    static $token = null;
    static $expiresAt = 0;
    if ($token !== null && time() < $expiresAt - 60) {
        return $token;
    }

    $ch = curl_init('https://login.microsoftonline.com/' . GRAPH_TENANT_ID . '/oauth2/v2.0/token');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'client_id'     => GRAPH_CLIENT_ID,
            'client_secret' => GRAPH_CLIENT_SECRET,
            'scope'         => 'https://graph.microsoft.com/.default',
            'grant_type'    => 'client_credentials',
        ]),
        CURLOPT_TIMEOUT        => 10,
    ]);
    $res    = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    // No curl_close() — a no-op since PHP 8.0 that PHP 8.5 flags as
    // deprecated, which this codebase's strict error handler would throw.

    if ($res === false || $status !== 200) {
        error_log('Graph token request failed (' . $status . '): ' . substr((string) $res, 0, 500));
        return null;
    }
    $data = json_decode((string) $res, true);
    if (!is_array($data) || !isset($data['access_token'])) {
        error_log('Graph token response missing access_token');
        return null;
    }

    $token     = (string) $data['access_token'];
    $expiresAt = time() + (int) ($data['expires_in'] ?? 3600);
    return $token;
}

// $body is always the plain-text version (also what lands in the outbox
// log). Pass $htmlBody to send a rich HTML message instead; $body is kept
// as the audit-trail record either way.
function sendEmail(string $to, string $subject, string $body, ?string $htmlBody = null): bool {
    $logLine = sprintf(
        "[%s] TO: %s | SUBJECT: %s\n%s\n%s\n\n",
        date('Y-m-d H:i:s'), $to, $subject, $body, str_repeat('-', 60)
    );
    @file_put_contents(__DIR__ . '/../mail_outbox.log', $logLine, FILE_APPEND | LOCK_EX);

    if (!defined('GRAPH_CLIENT_ID') || !GRAPH_CLIENT_ID) {
        return false;
    }

    $token = graphAccessToken();
    if ($token === null) {
        return false;
    }

    $message = [
        'subject'      => $subject,
        'body'         => [
            'contentType' => $htmlBody !== null ? 'HTML' : 'Text',
            'content'     => $htmlBody ?? $body,
        ],
        'toRecipients' => [
            ['emailAddress' => ['address' => $to]],
        ],
    ];
    if (defined('FROM_NAME') && FROM_NAME) {
        $message['from'] = ['emailAddress' => ['address' => MAIL_SENDER, 'name' => FROM_NAME]];
    }
    if (defined('REPLY_TO') && REPLY_TO) {
        $message['replyTo'] = [['emailAddress' => ['address' => REPLY_TO]]];
    }

    $ch = curl_init('https://graph.microsoft.com/v1.0/users/' . rawurlencode(MAIL_SENDER) . '/sendMail');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS     => json_encode(['message' => $message, 'saveToSentItems' => false]),
        CURLOPT_TIMEOUT        => 15,
    ]);
    $res    = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    if ($status === 202) {
        return true;
    }
    error_log("Graph sendMail failed ($status): " . substr((string) $res, 0, 500));
    return false;
}
