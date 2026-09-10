<?php
// Email → depot poller. Reads a dedicated mailbox (BCC it on every
// InvoiceToGo estimate/invoice), files each PDF under its project by the
// 4-digit Estimate # found in the subject / filename / PDF text, and drops
// anything unmatched into the Unfiled tray.
//
// Run from cron, e.g. every 5 min:
//   */5 * * * * php /home/USER/public_html/projects/api/cron/ingest-invoicetogo.php >> ~/depot-ingest.log 2>&1
//
// Or over HTTP with a guard:
//   curl "https://projects.jccs-services.com/api/cron/ingest-invoicetogo.php?secret=YOUR_CRON_SECRET"
//
// Config (config.php): DEPOT_IMAP_HOST, DEPOT_IMAP_PORT (993),
// DEPOT_IMAP_USER, DEPOT_IMAP_PASS, optional DEPOT_IMAP_FOLDER ('INBOX').

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/../financial-docs/_ingest.php';

$isCli = PHP_SAPI === 'cli';
if (!$isCli) {
    header('Content-Type: text/plain; charset=utf-8');
    $ok = defined('CRON_SECRET') && CRON_SECRET !== '' && hash_equals((string) CRON_SECRET, (string) ($_GET['secret'] ?? ''));
    if (!$ok) { http_response_code(403); exit("forbidden\n"); }
}
$log = function (string $m) { echo '[' . date('Y-m-d H:i:s') . '] ' . $m . "\n"; };

if (!function_exists('imap_open')) {
    $log('PHP imap extension not installed — cannot poll. Ask the host to enable it.');
    exit(0);
}
foreach (['DEPOT_IMAP_HOST', 'DEPOT_IMAP_USER', 'DEPOT_IMAP_PASS'] as $c) {
    if (!defined($c) || constant($c) === '' || constant($c) === 'CHANGE_ME') {
        $log("Not configured yet ($c missing). Nothing to do.");
        exit(0);
    }
}

$port   = defined('DEPOT_IMAP_PORT') ? (int) DEPOT_IMAP_PORT : 993;
$folder = defined('DEPOT_IMAP_FOLDER') ? DEPOT_IMAP_FOLDER : 'INBOX';
$mbox   = '{' . DEPOT_IMAP_HOST . ':' . $port . '/imap/ssl/novalidate-cert}' . $folder;

$imap = @imap_open($mbox, DEPOT_IMAP_USER, DEPOT_IMAP_PASS, 0, 1);
if (!$imap) {
    $log('imap_open failed: ' . imap_last_error());
    exit(1);
}

$pdo = getPDO();
$ids = imap_search($imap, 'UNSEEN') ?: [];
$log(count($ids) . ' new message(s).');

$filed = 0;
foreach ($ids as $num) {
    $header  = imap_headerinfo($imap, $num);
    $subject = isset($header->subject) ? imap_utf8($header->subject) : '';
    $struct  = imap_fetchstructure($imap, $num);

    $bodyText = '';
    $attachments = [];   // [ [name, bytes], ... ]

    $walk = function ($struct, $prefix) use (&$walk, $imap, $num, &$bodyText, &$attachments) {
        $parts = $struct->parts ?? [$struct];
        foreach ($parts as $i => $part) {
            $section = $prefix === '' ? (string) ($i + 1) : "$prefix." . ($i + 1);
            $isMultipart = ($part->type ?? 0) === 1;
            if ($isMultipart) { $walk($part, $prefix === '' ? '' : $section); continue; }

            $raw = imap_fetchbody($imap, $num, $prefix === '' && !isset($struct->parts) ? '1' : $section);
            $enc = $part->encoding ?? 0;
            if ($enc === 3) $raw = base64_decode($raw);
            elseif ($enc === 4) $raw = quoted_printable_decode($raw);

            $filename = '';
            foreach (array_merge($part->dparameters ?? [], $part->parameters ?? []) as $p) {
                if (in_array(strtolower($p->attribute), ['filename', 'name'], true)) $filename = $p->value;
            }
            $subtype = strtolower($part->subtype ?? '');

            if ($filename !== '' || ($part->type ?? 0) === 3 /* application */) {
                $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
                if (in_array($ext, ['pdf', 'png', 'jpg', 'jpeg'], true)) {
                    $attachments[] = [$filename, $raw];
                }
            } elseif (($part->type ?? 0) === 0 && $subtype === 'plain') {
                $bodyText .= "\n" . $raw;
            }
        }
    };
    $walk($struct, '');

    if (!$attachments) { $log("  \"$subject\" — no PDF attachment, skipping."); imap_setflag_full($imap, (string) $num, '\\Seen'); continue; }

    foreach ($attachments as [$name, $bytes]) {
        $tmp = tempnam(sys_get_temp_dir(), 'depot_');
        file_put_contents($tmp, $bytes);
        try {
            $res = storeFinancialDoc($pdo, $tmp, $name ?: 'attachment.pdf', 'email', [
                'subject'   => $subject,
                'body_text' => trim($bodyText),
            ]);
            $filed++;
            $log(sprintf('  filed #%d → project %s (%s, %s confidence)',
                $res['id'], $res['project_number'], $res['category'], $res['match_confidence'] ?? '—'));
        } catch (Throwable $e) {
            $log('  ERROR filing "' . $name . '": ' . $e->getMessage());
        } finally {
            @unlink($tmp);
        }
    }
    imap_setflag_full($imap, (string) $num, '\\Seen');
}

imap_close($imap);
$log("Done. $filed document(s) filed.");
