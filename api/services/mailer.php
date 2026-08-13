<?php
// Sends over SMTP (SSL) via a raw socket — no external dependencies, same
// pattern as FieldClock's api/config/mail.php. Every caller already treats
// this as fire-and-forget (return value is logged, never blocks the
// request that triggered it). If SMTP_HOST isn't configured — e.g. local
// dev, where api/config/config.php has no real mail credentials — this
// silently no-ops instead of erroring. Every send (attempted or not) is
// also appended to mail_outbox.log, so local testing can still see exactly
// what would have gone out, and production keeps a lightweight audit trail.
function sendEmail(string $to, string $subject, string $body): bool {
    $logLine = sprintf(
        "[%s] TO: %s | SUBJECT: %s\n%s\n%s\n\n",
        date('Y-m-d H:i:s'), $to, $subject, $body, str_repeat('-', 60)
    );
    @file_put_contents(__DIR__ . '/../mail_outbox.log', $logLine, FILE_APPEND | LOCK_EX);

    if (!defined('SMTP_HOST') || !SMTP_HOST) return false;

    $socket = @fsockopen('ssl://' . SMTP_HOST, SMTP_PORT, $errno, $errstr, 10);
    if (!$socket) return false;

    // Read one or more response lines; return the last one.
    $read = function () use ($socket): string {
        $out = '';
        while ($line = fgets($socket, 512)) {
            $out = $line;
            if (isset($line[3]) && $line[3] === ' ') break; // end of multi-line response
        }
        return $out;
    };
    $cmd = function (string $c) use ($socket, $read): string {
        fwrite($socket, $c . "\r\n");
        return $read();
    };

    $read(); // 220 greeting
    $cmd('EHLO ' . SMTP_HOST);
    $cmd('AUTH LOGIN');
    $cmd(base64_encode(SMTP_USER));
    $auth = $cmd(base64_encode(SMTP_PASS));
    if (strpos($auth, '235') === false) {
        fclose($socket);
        error_log("SMTP auth failed: $auth");
        return false;
    }

    $cmd('MAIL FROM:<' . FROM_EMAIL . '>');
    $cmd('RCPT TO:<' . $to . '>');
    $cmd('DATA');

    $headers  = "From: " . FROM_NAME . " <" . FROM_EMAIL . ">\r\n";
    $headers .= "To: <$to>\r\n";
    $headers .= "Subject: $subject\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $headers .= "X-Mailer: JCCS-Projects/1.0\r\n";

    $result = $cmd($headers . "\r\n" . $body . "\r\n.");
    $cmd('QUIT');
    fclose($socket);

    return strpos($result, '250') !== false;
}
