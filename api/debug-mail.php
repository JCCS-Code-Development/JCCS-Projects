<?php
// TEMPORARY diagnostic — DELETE THIS FILE after use.
// Runs the exact Microsoft Graph flow services/mailer.php uses and reports
// what fails. Gated by a one-off token so a random visitor can't probe it.
//
//   https://projects.jccs-services.com/api/debug-mail.php?token=9f3c1a7e5b2d4088&to=you@example.com
//
ini_set('display_errors', 0);
header('Content-Type: text/plain; charset=utf-8');
set_exception_handler(function ($e) { echo "EXCEPTION: " . $e->getMessage() . "\n"; exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

if (($_GET['token'] ?? '') !== '9f3c1a7e5b2d4088') { http_response_code(403); exit("forbidden\n"); }

require_once __DIR__ . '/config/config.php';

echo "=== config constants ===\n";
foreach (['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'MAIL_SENDER', 'FROM_NAME', 'REPLY_TO', 'FRONTEND_ORIGIN'] as $c) {
    if (!defined($c)) { echo sprintf("  %-20s MISSING\n", $c); continue; }
    $v = constant($c);
    if ($c === 'GRAPH_CLIENT_SECRET') {
        $v = $v === '' ? '(empty)' : (strlen($v) . ' chars, starts "' . substr($v, 0, 3) . '…", ends "…' . substr($v, -3) . '"');
    }
    echo sprintf("  %-20s %s\n", $c, $v);
}

echo "\n=== step 1: client-credentials token ===\n";
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
    CURLOPT_TIMEOUT        => 15,
]);
$res    = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$cerr   = curl_error($ch);
echo "  HTTP $status\n";
if ($cerr) { echo "  curl error: $cerr\n"; }
if ($res === false) { exit("  no response — outbound HTTPS blocked?\n"); }
$data = json_decode((string) $res, true);
if (!is_array($data) || !isset($data['access_token'])) {
    echo "  RESPONSE: " . substr((string) $res, 0, 900) . "\n";
    exit("\n>>> token request failed — usually a bad GRAPH_CLIENT_SECRET or GRAPH_TENANT_ID.\n");
}
echo "  OK — token acquired (" . strlen($data['access_token']) . " chars, expires_in " . ($data['expires_in'] ?? '?') . "s)\n";
$token = $data['access_token'];

$to = $_GET['to'] ?? '';
if ($to === '') { exit("\nPass &to=an@address to also run a test send.\n"); }

echo "\n=== step 2: test sendMail to $to ===\n";
$message = [
    'subject'      => 'JCCS Projects — mail diagnostic',
    'body'         => ['contentType' => 'HTML', 'content' => '<p>If you can read this, Graph delivery works.</p>'],
    'toRecipients' => [['emailAddress' => ['address' => $to]]],
];
if (defined('FROM_NAME') && FROM_NAME)  { $message['from']    = ['emailAddress' => ['address' => MAIL_SENDER, 'name' => FROM_NAME]]; }
if (defined('REPLY_TO') && REPLY_TO)    { $message['replyTo'] = [['emailAddress' => ['address' => REPLY_TO]]]; }

$ch = curl_init('https://graph.microsoft.com/v1.0/users/' . rawurlencode(MAIL_SENDER) . '/sendMail');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token, 'Content-Type: application/json'],
    CURLOPT_POSTFIELDS     => json_encode(['message' => $message, 'saveToSentItems' => false]),
    CURLOPT_TIMEOUT        => 20,
]);
$res    = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
echo "  HTTP $status\n";
if ($status === 202) {
    exit("\n>>> SUCCESS — Graph accepted the message. Check the $to inbox (and spam).\n");
}
echo "  RESPONSE: " . substr((string) $res, 0, 1200) . "\n";
echo "\n>>> send failed. Common causes:\n";
echo "    403 + 'ApplicationAccessPolicy' / 'Access to OData is disabled' — policy still propagating (wait 30 min) or noreply@ not in the GraphMailSenders group.\n";
echo "    403 + 'Access is denied. Check credentials' — admin consent for Mail.Send not granted.\n";
echo "    404 'user not found' — MAIL_SENDER mailbox doesn't exist / wrong address.\n";
