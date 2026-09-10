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
function financialDocText(string $path): string {
    if (!is_file($path)) return '';
    // Locate the binary without ever handing proc_open a bad path.
    $bin = null;
    foreach (['/usr/bin/pdftotext', '/usr/local/bin/pdftotext', '/opt/homebrew/bin/pdftotext'] as $c) {
        if (@is_file($c) && @is_executable($c)) { $bin = $c; break; }
    }
    if ($bin === null && function_exists('shell_exec')) {
        $found = @shell_exec('command -v pdftotext 2>/dev/null');
        $found = is_string($found) ? trim($found) : '';
        if ($found !== '' && @is_executable($found)) $bin = $found;
    }
    if ($bin === null) return '';

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

// Find the JCCS 4-digit Estimate # in the given haystack(s). Returns
// [project_number, confidence]:
//   high — a 4-digit token that matches a known project in project_cache
//   low  — exactly one 4-digit token, but no project match (probably a new #)
//   none — nothing usable → Unfiled
function financialDocMatch(PDO $pdo, array $haystacks): array {
    $text = strtolower(implode("\n", array_filter($haystacks)));
    preg_match_all('/(?<!\d)(\d{4})(?!\d)/', $text, $m);
    $nums = array_values(array_unique($m[1]));
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
    if (count($nums) === 1) return [(string) $nums[0], 'low'];
    return [FIN_UNFILED, 'none'];
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

    $type = financialDocType($meta['type'] ?? null, $haystacks);

    $projectNumber = trim((string) ($meta['project_number'] ?? ''));
    $confidence    = null;
    if (!preg_match('/^\d{4}$/', $projectNumber)) {
        [$projectNumber, $confidence] = financialDocMatch($pdo, $haystacks);
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

    return [
        'id'               => $docId,
        'project_number'   => $projectNumber,
        'unfiled'          => $projectNumber === FIN_UNFILED,
        'category'         => $type,
        'match_confidence' => $confidence,
        'amount'           => $amount,
    ];
}
