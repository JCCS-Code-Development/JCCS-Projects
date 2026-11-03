<?php
// Email → depot poller. Reads a dedicated mailbox (BCC it on every
// InvoiceToGo estimate/invoice) and sorts its inbox into two folders:
//   Estimates — the estimate PDF is filed in the app under its Estimate #
//               (the JCCS job number), which also marks the site visit
//               waiting on that number as sent. Then the email is moved here.
//   Invoices  — invoices are NOT read by the app; the email is just moved here.
// Any other mail stays in the inbox, starred, for a person; ?recheck=1 looks
// at the starred ones again. At most DEPOT_BATCH estimates (default 20) are
// filed per run, and a run stops early before the host's time limit, so a
// backlog clears a batch at a time. Opening an email in webmail is fine —
// read or unread, whatever is in the inbox gets sorted.
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
$ref = '{' . DEPOT_IMAP_HOST . ':' . $port . '/imap/ssl/novalidate-cert}';

// The two folders in the depot mailbox: Estimates (read and filed by the app)
// and Invoices (not read — just put away). Made on first use, next to INBOX
// the way the server names folders (cPanel: "INBOX.Estimates").
$boxes = imap_getmailboxes($imap, $ref, '*') ?: [];
$names = array_map(fn($b) => substr($b->name, strlen($ref)), $boxes);
$delim = $boxes[0]->delimiter ?? '.';
$folderFor = function (string $label) use ($imap, $ref, &$names, $delim, $log): string {
    foreach ($names as $n) {
        $leaf = ($p = strrpos($n, $delim)) === false ? $n : substr($n, $p + 1);
        if (strcasecmp($leaf, $label) === 0) return $n;
    }
    $prefixed = array_filter($names, fn($n) => stripos($n, 'INBOX' . $delim) === 0);
    $name = ($prefixed || $delim === '.' ? 'INBOX' . $delim : '') . $label;
    if (!imap_createmailbox($imap, $ref . $name)) throw new RuntimeException("Could not create the \"$label\" folder: " . imap_last_error());
    @imap_subscribe($imap, $ref . $name);   // so webmail shows it
    $names[] = $name;
    $log("Created the \"$label\" folder in the depot mailbox.");
    return $name;
};
$moveTo = function (int $num, string $label) use ($imap, $folderFor): void {
    if (!imap_mail_move($imap, (string) $num, $folderFor($label))) throw new RuntimeException("Could not move it to $label: " . imap_last_error());
};

// Everything still in the inbox, read or not (whatever is handled is moved
// out), except mail already set aside as not InvoiceToGo — unless rechecking.
$ids = imap_search($imap, $recheck ? 'ALL' : 'UNFLAGGED') ?: [];
if ($recheck) $log('Rechecking starred emails too.');
$log(count($ids) . ' email(s) in the inbox to sort.');
$reader = financialDocReaderName();
$log('PDF text reader: ' . ($reader === null ? 'NOT available on this server — matching uses the subject and file name only' : "available ($reader)"));

// This part of the app only keeps estimates: invoices filed by earlier runs
// are taken off the documents list (hidden, not deleted — the emails are in
// the Invoices folder).
$hid = $pdo->exec("UPDATE documents SET is_active = 0 WHERE source = 'email' AND category = 'invoice' AND is_active = 1");
if ($hid) $log("Removed $hid invoice(s) filed by earlier runs from the app (their emails go to the Invoices folder).");

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

// An estimate PDF the app already has (same Estimate # and file name).
$alreadyFiled = function (?string $number, string $file) use ($pdo): bool {
    if ($number === null) return false;
    $s = $pdo->prepare("SELECT 1 FROM documents d JOIN document_versions v ON v.document_id = d.id
                         WHERE d.source = 'email' AND d.category = 'estimate' AND d.is_active = 1 AND d.doc_number = ? AND v.original_filename = ? LIMIT 1");
    $s->execute([$number, $file]);
    return (bool) $s->fetchColumn();
};

// Earlier estimate PDFs left Unfiled before the Estimate # was read from the subject.
try {
    if ($moved = financialDocRefileUnfiled($pdo)) $log("Re-sorted $moved Unfiled estimate(s) onto their projects.");
} catch (Throwable $e) { $log('Re-sorting Unfiled failed: ' . $e->getMessage()); }

// Site visits whose estimate PDF is already here: marked sent.
try {
    require_once __DIR__ . '/../quote-requests/_common.php';
    if ($sent = qrSweepEstimateDocs($pdo)) $log("Marked $sent site visit(s) sent — their estimate PDFs were already in the depot.");
} catch (Throwable $e) { $log('Checking waiting site visits failed: ' . $e->getMessage()); }

$filed = 0; $invoices = 0; $skipped = 0; $estimates = 0; $done = 0;
foreach ($ids as $num) {
    // Filing an estimate is the slow part; invoices and estimates already in
    // the app are only moved.
    if ($estimates >= $batch || microtime(true) - $started > $budget) {
        $log('Stopping here for this run — ' . (count($ids) - $done) . ' left for the next one.');
        break;
    }
    $done++;
  try {
    if ($recheck) imap_clearflag_full($imap, (string) $num, '\\Flagged');
    $header  = imap_headerinfo($imap, $num);
    $subject = isset($header->subject) ? imap_utf8($header->subject) : '';
    $short   = mb_strimwidth($subject, 0, 70, '…');
    $named   = financialDocNumberFromName($subject);

    // Invoice: not read, just put in the Invoices folder.
    if ($named && $named[0] === 'invoice') {
        $moveTo($num, 'Invoices');
        $invoices++;
        $log("  invoice → Invoices folder — \"$short\"");
        continue;
    }

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

            // FT_PEEK: reading doesn't mark it read.
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

    $files = array_column($attachments, 0);
    $named = $named ?? financialDocNumberFromName(...$files);
    $isIt2g = $attachments && $fromInvoiceToGo($header, $subject, $bodyText . ' ' . $htmlText . ' ' . implode(' ', $files));
    if ($isIt2g && $named && $named[0] === 'invoice') {
        $moveTo($num, 'Invoices');
        $invoices++;
        $log("  invoice → Invoices folder — \"$short\"");
        continue;
    }
    if (!$isIt2g) {
        // Not an InvoiceToGo PDF: leave it in the inbox, starred, for a person.
        imap_setflag_full($imap, (string) $num, '\\Flagged');
        $skipped++;
        $log("  \"$short\" — " . ($attachments ? 'not from InvoiceToGo' : 'no PDF attached') . ', left in the inbox (starred).');
        continue;
    }

    // Estimate: file its PDF(s), then put the email in the Estimates folder.
    $ok = true;
    foreach ($attachments as [$name, $bytes]) {
        if ($alreadyFiled($named[1] ?? null, $name)) { $log("  already in the app — \"$short\" / $name"); continue; }
        $estimates++;   // only real filing counts toward the batch
        $tmp = tempnam(sys_get_temp_dir(), 'depot_');
        file_put_contents($tmp, $bytes);
        try {
            $res = storeFinancialDoc($pdo, $tmp, $name, 'email', [
                'subject'   => $subject,
                'body_text' => trim($bodyText),
                'type'      => 'estimate',
            ]);
            $filed++;
            $log(sprintf('  filed #%d → project %s (%s confidence) — "%s" / %s%s',
                $res['id'], $res['project_number'], $res['match_confidence'] ?? '—', $short, $name,
                $res['quote_sent_for'] ? " — site visit marked sent (Estimate #{$res['quote_sent_for']})" : ''));
        } catch (Throwable $e) {
            $ok = false;
            $log('  ERROR filing "' . $name . '": ' . $e->getMessage() . ' — left in the inbox, will retry.');
        } finally {
            @unlink($tmp);
        }
    }
    if ($ok) {
        imap_setflag_full($imap, (string) $num, '\\Seen');
        $moveTo($num, 'Estimates');
    }
  } catch (Throwable $e) {
    // One bad email doesn't stop the rest; it stays in the inbox and is tried again next run.
    $log("  ERROR on message $num: " . $e->getMessage() . ' — left in the inbox, will retry.');
  }
}

imap_expunge($imap);   // finishes the moves
imap_close($imap);
$log("Done. $filed estimate(s) filed, $invoices invoice(s) put in the Invoices folder, $skipped set aside (starred) as not InvoiceToGo.");
