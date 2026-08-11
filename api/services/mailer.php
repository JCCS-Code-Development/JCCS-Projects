<?php
// Dev-mode mailer — writes to a local outbox log instead of actually
// sending over SMTP, since jccs-projects has no real mail credentials
// configured yet (see FieldClock's config.php for the pattern production
// would use: SMTP_HOST/PORT/USER/PASS constants + a real mail library).
// Swap the body of sendEmail() for a real SMTP send once those constants
// exist here too — every caller already treats this as fire-and-forget
// (return value is logged, never blocks the request that triggered it).
function sendEmail(string $to, string $subject, string $body): bool {
    $line = sprintf(
        "[%s] TO: %s | SUBJECT: %s\n%s\n%s\n\n",
        date('Y-m-d H:i:s'), $to, $subject, $body, str_repeat('-', 60)
    );
    return file_put_contents(__DIR__ . '/../mail_outbox.log', $line, FILE_APPEND | LOCK_EX) !== false;
}
