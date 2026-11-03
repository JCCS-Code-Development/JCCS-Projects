<?php
// Email → depot poller. Reads a dedicated mailbox (BCC it on every
// InvoiceToGo estimate/invoice), files each InvoiceToGo PDF under its project
// by the 4-digit Estimate # found in the subject / filename / PDF text, and
// drops anything unmatched into the Unfiled tray. An estimate PDF also marks
// the site visit waiting on its number as sent.
//
// Only PDFs from InvoiceToGo are filed. Any other mail is left in the inbox
// and flagged (starred) so a person can look at it; ?recheck=1 looks at the
// starred ones again. At most DEPOT_BATCH
// emails (default 20) are handled per run, and a run stops early before the
// host's time limit, so a backlog clears a batch at a time.
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
    header('X-Accel-Buffering: no');
    $ok = defined('CRON_SECRET') && CRON_SECRET !== '' && hash_equals((string) CRON_SECRET, (string) ($_GET['secret'] ?? ''));
    if (!$ok) { http_response_code(403); exit("forbidden\n"); }
}
// Each line shows up as it happens (also in the browser).
while (ob_get_level() > 0) ob_end_flush();
$log = function (string $m) { echo '[' . date('Y-m-d H:i:s') . '] ' . $m . "\n"; flush(); };
// If PHP itself dies (memory, time limit), say so instead of just stopping.
register_shutdown_function(function () use ($log) {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR], true)) $log('STOPPED: ' . $e['message']);
});
@set_time_limit($isCli ? 300 : 60);
$started = microtime(true);
$budget  = $isCli ? 240 : 20;   // seconds of work per run, under the host's limit
$batch   = defined('DEPOT_BATCH') ? max(1, (int) DEPOT_BATCH) : 20;
// recheck: look again at emails starred by an earlier run (?recheck=1, or --recheck from the CLI).
$recheck = $isCli ? in_array('--recheck', $argv ?? [], true) : !empty($_GET['recheck']);

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
// Unread and not already set aside as "not InvoiceToGo" (unless rechecking).
$ids = imap_search($imap, $recheck ? 'UNSEEN' : 'UNSEEN UNFLAGGED') ?: [];
if ($recheck) $log('Rechecking starred emails too.');
$log(count($ids) . ' new message(s).' . (count($ids) > $batch ? " Handling up to $batch now; the rest on the next runs." : ''));
$log('PDF text reader: ' . (!financialDocHasReader() ? 'NOT available on this server — matching uses the subject and file name only' : 'available'));

// An InvoiceToGo email: its subject is "Estimate #4512 to review | JCCS
// Services LLC" / "Invoice #…", or it names InvoiceToGo in the sender or body.
$fromInvoiceToGo = function ($header, string $subject, string $body): bool {
    if (preg_match('/\b(estimate|invoice|quote|presupuesto|factura)\s*#\s*[A-Za-z0-9-]*\d/iu', $subject)) return true;
    $who = '';
    foreach (['from', 'sender', 'reply_to'] as $k) {
        foreach (is_array($header->$k ?? null) ? $header->$k : [] as $a) $who .= ' ' . ($a->mailbox ?? '') . '@' . ($a->host ?? '') . ' ' . (isset($a->personal) ? imap_utf8($a->personal) : '');
    }
    return (bool) preg_match('/invoice\s*2\s*go|invoicetogo|invoice\s+to\s+go/i', $who . ' ' . $subject . ' ' . $body);
};

$filed = 0; $skipped = 0; $handled = 0;
foreach ($ids as $num) {
    if ($handled >= $batch || microtime(true) - $started > $budget) {
        $log('Stopping here for this run — ' . (count($ids) - $handled) . ' left for the next one.');
        break;
    }
    $handled++;
  try {
    if ($recheck) imap_clearflag_full($imap, (string) $num, '\\Flagged');
    $header  = imap_headerinfo($imap, $num);
    $subject = isset($header->subject) ? imap_utf8($header->subject) : '';
    $struct  = imap_fetchstructure($imap, $num);

    $bodyText = '';
    $htmlText = '';
    $attachments = [];   // [ [name, bytes], ... ]

    $walk = function ($struct, $prefix) use (&$walk, $imap, $num, &$bodyText, &$htmlText, &$attachments) {
        $parts = $struct->parts ?? [$struct];
        foreach ($parts as $i => $part) {
            $section = $prefix === '' ? (string) ($i + 1) : "$prefix." . ($i + 1);
            $isMultipart = ($part->type ?? 0) === 1;
            if ($isMultipart) { $walk($part, $prefix === '' ? '' : $section); continue; }

            // FT_PEEK: reading doesn't mark it read — only a finished email is.
            $raw = imap_fetchbody($imap, $num, $prefix === '' && !isset($struct->parts) ? '1' : $section, FT_PEEK);
            $enc = $part->encoding ?? 0;
            if ($enc === 3) $raw = base64_decode($raw);
            elseif ($enc === 4) $raw = quoted_printable_decode($raw);

            $filename = '';
            // imap gives an empty object (not an array) when a part has no parameters.
            $list = fn($x) => is_array($x) ? $x : [];
            foreach (array_merge($list($part->dparameters ?? []), $list($part->parameters ?? [])) as $p) {
                if (in_array(strtolower($p->attribute), ['filename', 'name'], true)) $filename = $p->value;
            }
            $subtype = strtolower($part->subtype ?? '');

            if ($filename !== '' || ($part->type ?? 0) === 3 /* application */) {
                // PDFs only — images in an email are logos and signatures.
                if (strtolower(pathinfo($filename, PATHINFO_EXTENSION)) === 'pdf' || $subtype === 'pdf') {
                    $attachments[] = [$filename !== '' ? $filename : 'attachment.pdf', $raw];
                }
            } elseif (($part->type ?? 0) === 0 && $subtype === 'plain') {
                $bodyText .= "\n" . $raw;
            } elseif (($part->type ?? 0) === 0 && $subtype === 'html') {
                // HTML-only emails (InvoiceToGo's usually are): used only to
                // recognise InvoiceToGo, not for matching numbers (years, zips…).
                $htmlText .= "\n" . html_entity_decode(strip_tags($raw));
            }
        }
    };
    $walk($struct, '');

    if (!$attachments || !$fromInvoiceToGo($header, $subject, $bodyText . ' ' . $htmlText . ' ' . implode(' ', array_column($attachments, 0)))) {
        // Not an InvoiceToGo PDF: leave it unread in the inbox, starred, for a person.
        imap_setflag_full($imap, (string) $num, '\\Flagged');
        imap_clearflag_full($imap, (string) $num, '\\Seen');
        $skipped++;
        $log("  \"$subject\" — " . ($attachments ? 'not from InvoiceToGo' : 'no PDF attached') . ', left in the inbox (starred).');
        continue;
    }

    foreach ($attachments as [$name, $bytes]) {
        $tmp = tempnam(sys_get_temp_dir(), 'depot_');
        file_put_contents($tmp, $bytes);
        try {
            $res = storeFinancialDoc($pdo, $tmp, $name ?: 'attachment.pdf', 'email', [
                'subject'   => $subject,
                'body_text' => trim($bodyText),
            ]);
            $filed++;
            $log(sprintf('  filed #%d → project %s (%s, %s confidence)%s',
                $res['id'], $res['project_number'], $res['category'], $res['match_confidence'] ?? '—',
                $res['quote_sent_for'] ? " — site visit marked sent (Estimate #{$res['quote_sent_for']})" : ''));
        } catch (Throwable $e) {
            $log('  ERROR filing "' . $name . '": ' . $e->getMessage());
        } finally {
            @unlink($tmp);
        }
    }
    imap_setflag_full($imap, (string) $num, '\\Seen');
  } catch (Throwable $e) {
    // One bad email doesn't stop the rest; it stays unread and is tried again next run.
    $log("  ERROR on message $num: " . $e->getMessage() . ' — left unread, will retry.');
  }
}

imap_close($imap);
$log("Done. $filed document(s) filed, $skipped set aside (starred) as not InvoiceToGo.");
