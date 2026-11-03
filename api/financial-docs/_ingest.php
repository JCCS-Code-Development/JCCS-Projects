<?php
// Shared logic for filing an estimate/invoice PDF into the depot. Used by
// both financial-docs/ingest.php (HTTP, token-gated) and
// cron/ingest-invoicetogo.php (IMAP poller — calls storeFinancialDoc()
// directly, no HTTP round-trip).
//
// Estimates & invoices are just `documents` rows in their own category, so
// they inherit append-only versioning, preview, history, project scoping and
// client notifications from the existing Documents module.

const FIN_UPLOAD_DIR   = __DIR__ . '/../uploads/documents';
const FIN_UNFILED       = '0000';          // reserved project_number = "Unfiled" tray
const FIN_MAX_BYTES     = 60 * 1024 * 1024;
const FIN_ALLOWED_EXT   = ['pdf', 'png', 'jpg', 'jpeg'];

// Pull text out of a PDF, best-effort. Uses `pdftotext` (poppler) if the host
// has it; returns '' otherwise. Never throws, never emits a warning that a
// strict error handler could turn fatal.
// Where pdftotext lives on this server, or null when it isn't installed.
function financialDocReader(): ?string {
    foreach (['/usr/bin/pdftotext', '/usr/local/bin/pdftotext', '/opt/homebrew/bin/pdftotext'] as $c) {
        if (@is_file($c) && @is_executable($c)) return $c;
    }
    if (function_exists('shell_exec')) {
        $found = @shell_exec('command -v pdftotext 2>/dev/null');
        $found = is_string($found) ? trim($found) : '';
        if ($found !== '' && @is_executable($found)) return $found;
    }
    return null;
}
// The built-in reader (smalot/pdfparser in api/vendor — plain PHP, so it
// works on shared hosting without pdftotext). Needs PHP 8.1+ like the rest
// of api/vendor; loaded only when a PDF is actually read.
function financialDocPhpReader(): bool {
    static $ok = null;
    if ($ok !== null) return $ok;
    $ok = false;
    if (PHP_VERSION_ID >= 80100 && is_file(__DIR__ . '/../vendor/autoload.php')) {
        require_once __DIR__ . '/../vendor/autoload.php';
        $ok = class_exists(\Smalot\PdfParser\Parser::class);
    }
    return $ok;
}
function financialDocHasReader(): bool { return financialDocReader() !== null || financialDocPhpReader(); }
// For the depot log: which reader this server uses.
function financialDocReaderName(): ?string {
    return financialDocReader() !== null ? 'pdftotext' : (financialDocPhpReader() ? 'built-in' : null);
}

function financialDocText(string $path): string {
    if (!is_file($path)) return '';
    // Locate the binary without ever handing proc_open a bad path.
    $bin = financialDocReader();
    if ($bin === null) return financialDocTextPhp($path);

    $prev = set_error_handler(static fn() => true); // swallow proc warnings here only
    try {
        $descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $proc = proc_open([$bin, '-layout', '-nopgbrk', $path, '-'], $descriptors, $pipes);
        if (!is_resource($proc)) return '';
        $out = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        return is_string($out) ? $out : '';
    } catch (\Throwable $e) {
        return '';
    } finally {
        set_error_handler($prev);
    }
}

// Text of a PDF via the built-in reader; '' if it can't (scanned image,
// odd encoding, too big). Never throws.
function financialDocTextPhp(string $path): string {
    if (!financialDocPhpReader() || filesize($path) > 15 * 1024 * 1024) return '';
    $prev = set_error_handler(static fn() => true);
    try {
        $config = new \Smalot\PdfParser\Config();
        $config->setRetainImageContent(false);   // text only — keeps memory low
        $text = (new \Smalot\PdfParser\Parser([], $config))->parseFile($path)->getText();
        return mb_substr((string) $text, 0, 200000);
    } catch (\Throwable $e) {
        return '';
    } finally {
        set_error_handler($prev);
    }
}

// Find the JCCS 4-digit Estimate # in the given haystack(s). Returns
// [project_number, confidence]:
//   high — a 4-digit token that matches a known project in project_cache
//   low  — exactly one 4-digit token, but no project match (probably a new #)
//   none — nothing usable → Unfiled
//
// $exclude: a number that is NOT a project (an invoice's own Invoice #).
// $guessFrom: where a lone unknown number may be trusted — the subject and
// file name, not the email body or PDF (full of years, zips and amounts).
function financialDocMatch(PDO $pdo, array $haystacks, ?string $exclude = null, ?array $guessFrom = null): array {
    $text = strtolower(implode("\n", array_filter($haystacks)));
    preg_match_all('/(?<!\d)(\d{4})(?!\d)/', $text, $m);
    $nums = array_values(array_diff(array_unique($m[1]), [$exclude]));
    if (!$nums) return [FIN_UNFILED, 'none'];

    $in   = implode(',', array_fill(0, count($nums), '?'));
    $stmt = $pdo->prepare("SELECT project_number FROM project_cache WHERE project_number IN ($in) AND project_number <> '0000'");
    $stmt->execute($nums);
    $known = $stmt->fetchAll(PDO::FETCH_COLUMN);
    if (count($known) === 1) return [(string) $known[0], 'high'];
    if (count($known) > 1) {
        // Prefer the one that appears earliest in the text.
        usort($known, fn($a, $b) => strpos($text, $a) <=> strpos($text, $b));
        return [(string) $known[0], 'high'];
    }
    if ($guessFrom !== null) {
        preg_match_all('/(?<!\d)(\d{4})(?!\d)/', strtolower(implode("\n", array_filter($guessFrom))), $g);
        $nums = array_values(array_diff(array_unique($g[1]), [$exclude]));
    }
    if (count($nums) === 1) return [(string) $nums[0], 'low'];
    return [FIN_UNFILED, 'none'];
}

// What InvoiceToGo puts in the subject and file name: "Estimate #4551 to
// review | …", "Invoice #5876 from …", "estimate_4551.pdf". Returns
// ['estimate'|'invoice', number] or null.
function financialDocNumberFromName(string ...$names): ?array {
    foreach ($names as $s) {
        if (preg_match('/\b(estimate|quote|presupuesto|cotizaci[oó]n|invoice|factura)\s*(?:#|no\.?|number|n[uú]mero)?\s*[_:-]?\s*#?\s*(\d{2,10})\b/iu', $s, $m)) {
            return [preg_match('/invoice|factura/i', $m[1]) ? 'invoice' : 'estimate', $m[2]];
        }
    }
    return null;
}

// Is this number a project we know?
function financialDocKnownProject(PDO $pdo, string $number): bool {
    $s = $pdo->prepare("SELECT 1 FROM project_cache WHERE project_number = ? AND project_number <> '0000'");
    $s->execute([$number]);
    return (bool) $s->fetchColumn();
}

// Where a document goes. An estimate's Estimate # IS the JCCS job number;
// an invoice's Invoice # is not, so an invoice only lands on a project whose
// number shows up somewhere (else Unfiled for a person).
function financialDocPlace(PDO $pdo, string $type, ?string $docNumber, array $haystacks, array $guessFrom): array {
    if ($type === 'estimate' && $docNumber !== null && preg_match('/^\d{4}$/', $docNumber)) {
        return [$docNumber, financialDocKnownProject($pdo, $docNumber) ? 'high' : 'low'];
    }
    return financialDocMatch($pdo, $haystacks, $type === 'invoice' ? $docNumber : null, $guessFrom);
}

// Depot PDFs sitting in Unfiled: sort them again — by the number in the
// subject / file name, and (when this server can read PDFs) by a known
// project number printed inside, e.g. on an invoice. One that still can't be
// placed is marked 'unmatched' so it isn't read again every run; a person
// assigns it from the Unfiled tray. Marks waiting site visits sent too.
function financialDocRefileUnfiled(PDO $pdo, int $limit = 30): int {
    $canRead = financialDocHasReader();
    $s = $pdo->prepare("SELECT d.id, d.category, d.title, d.doc_number, v.original_filename, v.file_path FROM documents d
                          LEFT JOIN document_versions v ON v.document_id = d.id AND v.version_number = 1
                         WHERE d.project_number = ? AND d.source = 'email' AND d.is_active = 1
                           AND d.category IN ('estimate', 'invoice')
                           AND (d.match_confidence IS NULL OR d.match_confidence <> 'unmatched')
                           AND (? OR d.category = 'estimate' OR d.doc_number IS NULL)
                         ORDER BY d.id LIMIT " . (int) $limit);
    $s->execute([FIN_UNFILED, $canRead ? 1 : 0]);
    $moved = 0;
    foreach ($s->fetchAll() as $d) {
        $names = [(string) $d['title'], (string) $d['original_filename']];
        $named = financialDocNumberFromName(...$names) ?? ($d['doc_number'] ? [$d['category'], (string) $d['doc_number']] : null);
        $type = $named[0] ?? $d['category'];
        $number = $named[1] ?? null;
        $hay = $names;
        if ($canRead && $d['file_path']) $hay[] = financialDocText(__DIR__ . '/../uploads/' . $d['file_path']);
        [$project, $confidence] = financialDocPlace($pdo, $type, $number, $hay, $names);
        if ($project === FIN_UNFILED) {
            // Tried everything this server can do: leave it for a person.
            if ($type === 'estimate' || $canRead) $confidence = 'unmatched';
            else $confidence = 'none';
        } else {
            $moved++;
        }
        $pdo->prepare('UPDATE documents SET category = ?, doc_number = COALESCE(?, doc_number), project_number = ?, match_confidence = ? WHERE id = ?')
            ->execute([$type, $number, $project, $confidence, $d['id']]);
        if ($type === 'estimate' && $number !== null) {
            try {
                require_once __DIR__ . '/../quote-requests/_common.php';
                qrMatchEstimateDoc($pdo, (int) $d['id'], $number, []);
            } catch (Throwable $e) { error_log('refile → quote link: ' . $e->getMessage()); }
        }
    }
    return $moved;
}

// The Estimate # printed on an InvoiceToGo estimate ("Estimate # 4602",
// "Estimate No. 4602"), else the 4-digit job number it was filed under.
function financialDocEstimateNumber(array $haystacks, string $projectNumber): ?string {
    $text = implode("\n", array_filter($haystacks));
    if (preg_match('/\b(?:estimate|presupuesto|cotizaci[oó]n)\s*(?:#|no\.?|number|n[uú]mero)?\s*:?\s*#?\s*([A-Za-z0-9-]{2,20})\b/iu', $text, $m) && preg_match('/\d/', $m[1])) {
        return $m[1];
    }
    return $projectNumber !== FIN_UNFILED && preg_match('/^\d{4}$/', $projectNumber) ? $projectNumber : null;
}

// estimate | invoice, guessed from the text if not given explicitly.
function financialDocType(?string $given, array $haystacks): string {
    if ($given === 'estimate' || $given === 'invoice') return $given;
    $t = strtolower(implode(' ', array_filter($haystacks)));
    if (preg_match('/\b(estimate|quote|presupuesto|cotizaci[oó]n)\b/', $t)) return 'estimate';
    return 'invoice';
}

// Move a temp/attachment file into the depot and create the documents +
// document_versions rows. $meta may carry doc_number/amount/issue_date/
// due_date/doc_status/type/subject/body_text. Returns a summary array.
function storeFinancialDoc(
    PDO $pdo,
    string $srcPath,
    string $originalName,
    string $source,          // 'email' | 'manual' | 'api'
    array $meta = [],
    ?int $userId = null,
    ?string $userName = null
): array {
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    if (!in_array($ext, FIN_ALLOWED_EXT, true)) {
        throw new RuntimeException('Unsupported file type: .' . $ext);
    }
    if (filesize($srcPath) > FIN_MAX_BYTES) {
        throw new RuntimeException('File too large');
    }

    $text = $ext === 'pdf' ? financialDocText($srcPath) : '';
    $haystacks = [$meta['subject'] ?? '', $originalName, $text, $meta['body_text'] ?? ''];

    // The subject / file name say what it is and its number, when InvoiceToGo sent it.
    $named = financialDocNumberFromName((string) ($meta['subject'] ?? ''), $originalName);
    $type = financialDocType($meta['type'] ?? ($named[0] ?? null), $haystacks);
    if (empty($meta['doc_number']) && $named && $named[0] === $type) $meta['doc_number'] = $named[1];

    $projectNumber = trim((string) ($meta['project_number'] ?? ''));
    $confidence    = null;
    if (!preg_match('/^\d{4}$/', $projectNumber)) {
        [$projectNumber, $confidence] = financialDocPlace($pdo, $type, $meta['doc_number'] ?? null, $haystacks, [$meta['subject'] ?? '', $originalName]);
    } elseif ($source === 'email') {
        $confidence = 'high';
    }

    // Amount: explicit, else first "$1,234.56"-ish number in the text.
    $amount = isset($meta['amount']) && $meta['amount'] !== '' ? (float) $meta['amount'] : null;
    if ($amount === null && $text !== '' && preg_match('/(?:total|balance due|amount due)[^\d]{0,20}\$?\s*([\d,]+\.\d{2})/i', $text, $am)) {
        $amount = (float) str_replace(',', '', $am[1]);
    }

    if (!is_dir(FIN_UPLOAD_DIR)) { mkdir(FIN_UPLOAD_DIR, 0755, true); }

    $title = $meta['title'] ?? null;
    if (!$title) {
        $title = ($type === 'estimate' ? 'Estimate' : 'Invoice')
            . (!empty($meta['doc_number']) ? ' ' . $meta['doc_number'] : '')
            . ' — ' . ($meta['subject'] ?? pathinfo($originalName, PATHINFO_FILENAME));
    }
    $title = mb_substr(sanitizeString($title), 0, 200);

    $moved = null;
    try {
        $pdo->beginTransaction();

        $pdo->prepare(
            'INSERT INTO documents
               (project_number, category, title, doc_number, amount, issue_date, due_date, doc_status, source, match_confidence, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)'
        )->execute([
            $projectNumber, $type, $title,
            !empty($meta['doc_number']) ? mb_substr((string) $meta['doc_number'], 0, 60) : null,
            $amount,
            !empty($meta['issue_date']) ? $meta['issue_date'] : null,
            !empty($meta['due_date']) ? $meta['due_date'] : null,
            !empty($meta['doc_status']) ? mb_substr((string) $meta['doc_status'], 0, 20) : null,
            $source,
            $confidence,
            $userId ?? 0,
        ]);
        $docId = (int) $pdo->lastInsertId();

        $stored = "{$docId}-v1-" . bin2hex(random_bytes(6)) . ".{$ext}";
        if (!@copy($srcPath, FIN_UPLOAD_DIR . '/' . $stored)) {
            throw new RuntimeException('Could not save the file');
        }
        $moved = FIN_UPLOAD_DIR . '/' . $stored;

        $pdo->prepare(
            'INSERT INTO document_versions
               (document_id, version_number, file_path, original_filename, notes, uploaded_by, uploaded_by_name)
             VALUES (?, 1, ?, ?, ?, ?, ?)'
        )->execute([
            $docId, "documents/{$stored}", mb_substr($originalName, 0, 255),
            $source === 'email' ? 'Ingested from email' : null,
            $userId ?? 0, $userName ?? 'Email ingest',
        ]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        if ($moved) { @unlink($moved); }
        throw $e;
    }

    // An estimate PDF: any site visit waiting on its Estimate # is now sent.
    // The document keeps that number, so a number typed in later still finds
    // it. Best-effort — filing the PDF never fails because of this.
    $sentFor = null;
    if (in_array($type, ['estimate', 'addon_estimate'], true)) {
        try {
            require_once __DIR__ . '/../quote-requests/_common.php';
            $sentFor = qrMatchEstimateDoc($pdo, $docId, $meta['doc_number'] ?? null, $haystacks);
            $docNumber = $sentFor ?? (!empty($meta['doc_number']) ? null : financialDocEstimateNumber($haystacks, $projectNumber));
            if ($docNumber !== null && empty($meta['doc_number'])) {
                $pdo->prepare('UPDATE documents SET doc_number = ? WHERE id = ? AND doc_number IS NULL')->execute([$docNumber, $docId]);
            }
        } catch (Throwable $e) {
            error_log('estimate → quote link: ' . $e->getMessage());
        }
    }

    return [
        'quote_sent_for'   => $sentFor,
        'id'               => $docId,
        'project_number'   => $projectNumber,
        'unfiled'          => $projectNumber === FIN_UNFILED,
        'category'         => $type,
        'match_confidence' => $confidence,
        'amount'           => $amount,
    ];
}
