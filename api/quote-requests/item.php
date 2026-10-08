<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/_common.php';

$auth   = requireAuth(QR_ROLES);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$id     = (int)($_GET['id'] ?? 0);
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

$row = qrLoadVisible($pdo, $auth, $id);
$isAdmin = qrIsAdmin($auth);

if ($method === 'GET') {
    $out = qrPresent($row, $auth);

    $out['recipients'] = qrRecipients($pdo, $id);

    $s = $pdo->prepare('SELECT * FROM quote_request_photos WHERE quote_request_id = ? ORDER BY id');
    $s->execute([$id]);
    $out['photos'] = array_map(function ($p) {
        $p['id'] = (int)$p['id'];
        $p['note_id'] = $p['note_id'] !== null ? (int)$p['note_id'] : null;
        $p['is_before'] = (int)$p['is_before'];
        $p['is_reference'] = (int)$p['is_reference'];
        $p['annotations'] = $p['annotations_json'] ? json_decode($p['annotations_json'], true) : null;
        unset($p['annotations_json']);
        $p['url'] = qrFileUrl($p['file_path']);
        return $p;
    }, $s->fetchAll());

    $s = $pdo->prepare('SELECT id, body, sort_order, created_by_name, created_at, updated_at FROM quote_request_notes WHERE quote_request_id = ? ORDER BY sort_order, id');
    $s->execute([$id]);
    $out['notes'] = array_map(function ($n) { $n['id'] = (int)$n['id']; $n['sort_order'] = (int)$n['sort_order']; return $n; }, $s->fetchAll());

    $s = $pdo->prepare('SELECT id, note_id, file_path, mime, duration_sec, peaks, uploaded_by_name, created_at FROM quote_request_audio WHERE quote_request_id = ? ORDER BY id');
    $s->execute([$id]);
    $out['audio'] = array_map(function ($a) {
        return ['id' => (int)$a['id'], 'note_id' => $a['note_id'] !== null ? (int)$a['note_id'] : null, 'url' => qrFileUrl($a['file_path']),
                'mime' => $a['mime'], 'duration_sec' => $a['duration_sec'] !== null ? (int)$a['duration_sec'] : null,
                'peaks' => $a['peaks'] ? array_map('intval', explode(',', $a['peaks'])) : [],
                'uploaded_by_name' => $a['uploaded_by_name'], 'created_at' => $a['created_at']];
    }, $s->fetchAll());

    $s = $pdo->prepare('SELECT * FROM quote_request_files WHERE quote_request_id = ? ORDER BY id');
    $s->execute([$id]);
    $out['files'] = array_map(function ($f) { $f['id'] = (int)$f['id']; $f['url'] = qrFileUrl($f['file_path']); return $f; }, $s->fetchAll());

    $s = $pdo->prepare('SELECT id, kind, body, author_id, author_name, created_at FROM quote_request_comments WHERE quote_request_id = ? ORDER BY id');
    $s->execute([$id]);
    $out['comments'] = $s->fetchAll();

    $s = $pdo->prepare('SELECT id, action, from_status, to_status, note, actor_name, created_at FROM quote_request_activity WHERE quote_request_id = ? ORDER BY id DESC');
    $s->execute([$id]);
    $out['activity'] = $s->fetchAll();

    if ($isAdmin) {
        $s = $pdo->prepare('SELECT id, kind, note, created_by_name, created_at, CHAR_LENGTH(scope_text) AS scope_length FROM quote_request_versions WHERE quote_request_id = ? ORDER BY id DESC');
        $s->execute([$id]);
        $out['versions'] = $s->fetchAll();
    }

    // Only show the paid AI button when the server is actually set up for it.
    $out['ai_available']   = defined('ANTHROPIC_API_KEY') && ANTHROPIC_API_KEY !== '' && ANTHROPIC_API_KEY !== 'CHANGE_ME' && PHP_VERSION_ID >= 80100;
    $out['actions']        = qrAvailableActions($auth, $row);
    $out['can_edit']       = $isAdmin ? $row['status'] !== 'cancelled' : qrFieldCanEdit($auth, $row);
    $out['can_edit_scope'] = $isAdmin && !in_array($row['status'], QR_SCOPE_LOCKED, true);

    echo json_encode(['quoteRequest' => $out]);

} elseif ($method === 'PATCH') {
    $body = jsonBody();
    if ($isAdmin ? $row['status'] === 'cancelled' : !qrFieldCanEdit($auth, $row)) {
        http_response_code(409); exit(json_encode(['error' => 'This request can no longer be edited']));
    }

    $sets = []; $params = [];
    qrCollectFields($pdo, $body, $auth, $sets, $params);
    $recipientIds = array_key_exists('recipient_ids', $body) ? qrCleanRecipientIds($pdo, $body['recipient_ids']) : null;

    $scopeChanged = false;
    if (array_key_exists('scope_text', $body)) {
        if (!$isAdmin) { http_response_code(403); exit(json_encode(['error' => 'Only the office edits the scope'])); }
        if (in_array($row['status'], QR_SCOPE_LOCKED, true)) {
            http_response_code(409); exit(json_encode(['error' => 'The scope is locked — reopen the request to edit it']));
        }
        $scope = rtrim(str_replace("\r\n", "\n", (string)($body['scope_text'] ?? '')));
        if (strlen($scope) > 200000) { http_response_code(422); exit(json_encode(['error' => 'Scope is too long'])); }
        $scopeChanged = $scope !== (string)$row['scope_text'];
        $sets[] = 'scope_text = ?'; $params[] = $scope === '' ? null : $scope;
    }
    // Once approved, the structured form is part of the locked record too.
    if (array_key_exists('form', $body) && in_array($row['status'], QR_SCOPE_LOCKED, true)) {
        http_response_code(409); exit(json_encode(['error' => 'The site walk is locked — reopen the request to edit it']));
    }

    // keep: true — the user saved (Next / Save): give an unsaved walk its Q-number.
    $keep = !empty($body['keep']);
    if (!$sets && $recipientIds === null && !$keep) { echo json_encode(['message' => 'Nothing to update']); exit; }

    $pdo->beginTransaction();
    try {
        if ($sets) {
            $params[] = $id;
            $pdo->prepare('UPDATE quote_requests SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
        }
        if ($recipientIds !== null) qrSetRecipients($pdo, $id, $recipientIds);
        if ($keep) qrAssignNumber($pdo, $id);
        $updated = qrLoadVisible($pdo, $auth, $id);

        if ($scopeChanged) {
            qrSnapshot($pdo, $updated, $auth, 'scope_edit', isset($body['version_note']) ? mb_substr(sanitizeString($body['version_note']), 0, 255) : null);
            // Editing the scope of a freshly submitted request means review has started.
            if ($row['status'] === 'submitted') {
                $pdo->prepare("UPDATE quote_requests SET status = 'in_review' WHERE id = ?")->execute([$id]);
                qrLogActivity($pdo, $id, $auth, 'start_review', 'submitted', 'in_review');
            }
        }
        if ($isAdmin && array_key_exists('assigned_to', $body) && (int)$updated['assigned_to'] !== (int)$row['assigned_to']) {
            qrLogActivity($pdo, $id, $auth, 'assigned_estimator', null, null, $updated['assigned_to_name'] ?? 'Unassigned');
            qrNotifyUser($pdo, $updated['assigned_to'] ? (int)$updated['assigned_to'] : null, $updated, 'quote_assigned_estimator',
                'Quote assigned to you: ' . $updated['title'], $updated['facility'], $auth['user_id']);
        }
        if ($isAdmin && array_key_exists('field_manager_id', $body) && (int)$updated['field_manager_id'] !== (int)$row['field_manager_id']) {
            qrLogActivity($pdo, $id, $auth, 'assigned_field', null, null, $updated['field_manager_name'] ?? 'Unassigned');
            qrNotifyUser($pdo, $updated['field_manager_id'] ? (int)$updated['field_manager_id'] : null, $updated, 'quote_assigned_field',
                'Site walk assigned: ' . $updated['title'], $updated['facility'], $auth['user_id']);
        }
        if ($isAdmin && array_key_exists('estimate_number', $body) && (string)$updated['estimate_number'] !== (string)$row['estimate_number']) {
            qrLogActivity($pdo, $id, $auth, 'estimate_number', null, null, $updated['estimate_number'] ?? 'cleared');
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    echo json_encode(['message' => 'Saved', 'request_no' => qrRequestNo($updated['quote_number'])]);

} elseif ($method === 'DELETE') {
    // Permanent delete: admins any request, field managers only their own
    // untouched draft. Everything else should be cancelled instead, which
    // keeps the history.
    if (!$isAdmin && !($row['status'] === 'draft' && (int)$row['created_by'] === $auth['user_id'])) {
        http_response_code(403); exit(json_encode(['error' => 'Only your own drafts can be deleted']));
    }
    $paths = [];
    foreach (['quote_request_photos', 'quote_request_files', 'quote_request_audio'] as $t) {
        $s = $pdo->prepare("SELECT file_path FROM $t WHERE quote_request_id = ?");
        $s->execute([$id]);
        $paths = array_merge($paths, $s->fetchAll(PDO::FETCH_COLUMN));
    }
    $pdo->beginTransaction();
    try {
        foreach (['quote_request_photos', 'quote_request_files', 'quote_request_comments', 'quote_request_activity', 'quote_request_versions', 'quote_request_recipients', 'quote_request_notes', 'quote_request_audio'] as $t) {
            $pdo->prepare("DELETE FROM $t WHERE quote_request_id = ?")->execute([$id]);
        }
        $pdo->prepare('DELETE FROM notifications WHERE recipient_type = ? AND link_path = ?')->execute(['staff', '/quotes/' . $id]);
        $pdo->prepare('DELETE FROM quote_requests WHERE id = ?')->execute([$id]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    foreach ($paths as $p) { @unlink(__DIR__ . '/../uploads/' . $p); }
    echo json_encode(['message' => 'Deleted']);

} else { http_response_code(405); }
