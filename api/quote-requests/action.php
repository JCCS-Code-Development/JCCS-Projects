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
require_once __DIR__ . '/../services/inventory_client.php';
require_once __DIR__ . '/../services/calendar_client.php';

// Every status change goes through here (POST {id, action, note?, ...}) so
// the transition rules in QR_ACTIONS are enforced in exactly one place and
// every change lands in quote_request_activity.
$auth = requireAuth(QR_ROLES);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$pdo    = getPDO();
$body   = jsonBody();
$id     = (int)($body['id'] ?? 0);
$action = (string)($body['action'] ?? '');
$note   = isset($body['note']) ? trim((string)$body['note']) : '';
if (!$id || $action === '') { http_response_code(422); exit(json_encode(['error' => 'Missing id or action'])); }

$acceptedProject = null;
$pdo->beginTransaction();
try {
    // Row lock so two people clicking at once can't both transition it.
    $stmt = $pdo->prepare('SELECT * FROM quote_requests WHERE id = ? FOR UPDATE');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row || !qrCanView($auth, $row)) {
        $pdo->rollBack();
        http_response_code(404); exit(json_encode(['error' => 'Quote request not found']));
    }
    if (!qrActionAllowed($auth, $row, $action)) {
        $pdo->rollBack();
        http_response_code(409); exit(json_encode(['error' => "Can't {$action} a request that is {$row['status']}"]));
    }

    $from = $row['status'];
    $to   = QR_ACTIONS[$action]['to'];
    $sets = []; $params = [];
    $fail = function (string $msg) use ($pdo) { $pdo->rollBack(); http_response_code(422); exit(json_encode(['error' => $msg])); };

    switch ($action) {
        case 'submit':
            if (trim((string)$row['title']) === '') $fail('Add a title before submitting');
            if (trim((string)$row['facility']) === '' && !$row['customer_id']) $fail('Add the facility or customer before submitting');
            $nc = $pdo->prepare("SELECT COUNT(*) FROM quote_request_notes WHERE quote_request_id = ? AND body IS NOT NULL AND body <> ''");
            $nc->execute([$id]);
            if (trim((string)$row['description']) === '' && !$row['form_json'] && !(int)$nc->fetchColumn()) $fail('Describe the work before submitting');
            if ($row['work_type'] === 'addon' && !$row['project_number']) $fail('Pick the project this add-on belongs to');
            $sets[] = 'submitted_at = NOW()';
            qrAssignNumber($pdo, $id); // submitting always saves
            if (!$row['site_visit_date'] && !qrIsAdmin($auth)) { $sets[] = 'site_visit_date = CURDATE()'; }
            break;

        case 'request_info':
            if ($note === '') $fail('Say what information is missing');
            if (!qrFieldUserId($row)) $fail('Assign a field manager first — there is no one to ask');
            break;

        case 'approve':
            if (trim((string)$row['scope_text']) === '') $fail('Write or generate the Scope of Work before approving');
            $sets[] = 'approved_at = NOW()';
            $sets[] = 'approved_by_name = ?'; $params[] = $auth['name'];
            break;

        case 'set_estimate':
            $en = trim((string)($body['estimate_number'] ?? ''));
            if (!preg_match('/^[A-Za-z0-9-]{1,20}$/', $en)) $fail('Enter the InvoiceToGo Estimate #');
            $sets[] = 'estimate_number = ?'; $params[] = $en;
            $to = $from === 'approved' ? 'estimating' : $from;
            $note = $note !== '' ? $note : "Estimate #{$en}";
            break;

        case 'mark_sent':
            $en = trim((string)($body['estimate_number'] ?? $row['estimate_number'] ?? ''));
            if (!preg_match('/^[A-Za-z0-9-]{1,20}$/', $en)) $fail('Enter the InvoiceToGo Estimate # before marking it sent');
            $sets[] = 'estimate_number = ?'; $params[] = $en;
            $sets[] = 'sent_at = NOW()';
            $sets[] = 'last_reminded_at = NULL';
            break;

        case 'accept':
            $sets[] = 'decided_at = NOW()';
            $sets[] = 'decline_reason = NULL';
            // A won new job becomes a project under its InvoiceToGo Estimate #
            // (the shared 4-digit job number every JCCS app keys on).
            if (empty($row['project_number']) && preg_match('/^\d{4}$/', (string)$row['estimate_number'])) {
                $sets[] = 'project_number = ?'; $params[] = $row['estimate_number'];
            }
            break;

        case 'decline':
            if ($note === '') $fail('Add the reason it was declined');
            $sets[] = 'decided_at = NOW()';
            $sets[] = 'decline_reason = ?'; $params[] = mb_substr($note, 0, 255);
            break;

        case 'undo_decision':
            $sets[] = 'decided_at = NULL';
            $sets[] = 'decline_reason = NULL';
            break;

        // ── Without a PO ──
        case 'schedule':
            $start = qrValidDateTime($body['scheduled_start'] ?? null);
            if (!$start) $fail('Pick when the work is scheduled');
            $end = qrValidDateTime($body['scheduled_end'] ?? null);
            if ($end && $end < $start) $fail('The end has to be after the start');
            $sets[] = 'scheduled_start = ?'; $params[] = $start;
            $sets[] = 'scheduled_end = ?';   $params[] = $end;
            $note = $note !== '' ? $note : (($from === 'scheduled' ? 'Rescheduled for ' : 'Scheduled for ') . date('M j, g:i A', strtotime($start)));
            break;

        case 'unschedule':
            $sets[] = 'scheduled_start = NULL';
            $sets[] = 'scheduled_end = NULL';
            break;

        case 'mark_done':
            $sets[] = 'completed_at = NOW()';
            $sets[] = 'completed_by_name = ?'; $params[] = $auth['name'];
            break;

        case 'undo_done':
            $sets[] = 'completed_at = NULL';
            $sets[] = 'completed_by_name = NULL';
            break;

        case 'mark_invoiced':
            $inv = trim((string)($body['invoice_number'] ?? ''));
            if (!preg_match('/^[A-Za-z0-9-]{1,20}$/', $inv)) $fail('Enter the InvoiceToGo Invoice #');
            $sets[] = 'invoice_number = ?'; $params[] = $inv;
            $sets[] = 'invoiced_at = NOW()';
            $note = $note !== '' ? $note : "Invoice #{$inv}";
            break;

        case 'undo_invoiced':
            $sets[] = 'invoiced_at = NULL';
            break;
    }

    $sets[] = 'status = ?'; $params[] = $to;
    $params[] = $id;
    $pdo->prepare('UPDATE quote_requests SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    $stmt = $pdo->prepare('SELECT * FROM quote_requests WHERE id = ?');
    $stmt->execute([$id]);
    $updated = $stmt->fetch();

    qrLogActivity($pdo, $id, $auth, $action, $from, $to, $note !== '' ? $note : null);

    // Side effects: version snapshots, thread entries, notifications.
    $title = $updated['title'];
    switch ($action) {
        case 'submit':
            qrSnapshot($pdo, $updated, $auth, 'field_submission');
            if ($from === 'needs_info' && $note !== '') {
                $pdo->prepare("INSERT INTO quote_request_comments (quote_request_id, kind, body, author_id, author_name) VALUES (?, 'info_response', ?, ?, ?)")
                    ->execute([$id, $note, $auth['user_id'], $auth['name']]);
            }
            qrNotifyOffice($pdo, $updated, $from === 'needs_info' ? 'quote_info_provided' : 'quote_submitted',
                ($from === 'needs_info' ? 'Info added: ' : 'New site walk: ') . $title,
                $updated['facility'] ?: $auth['name'], $auth['user_id']);
            break;

        case 'request_info':
            $pdo->prepare("INSERT INTO quote_request_comments (quote_request_id, kind, body, author_id, author_name) VALUES (?, 'info_request', ?, ?, ?)")
                ->execute([$id, $note, $auth['user_id'], $auth['name']]);
            qrNotifyUser($pdo, qrFieldUserId($updated), $updated, 'quote_needs_info', 'More info needed: ' . $title, $note, $auth['user_id']);
            break;

        case 'approve':
            qrSnapshot($pdo, $updated, $auth, 'approved', $note !== '' ? mb_substr($note, 0, 255) : null);
            qrNotifyUser($pdo, qrFieldUserId($updated), $updated, 'quote_approved', 'Scope approved: ' . $title, null, $auth['user_id']);
            break;

        case 'accept':
            $granted = qrGrantRecipientsAccess($pdo, $updated);
            // The visit's client is registered to the new project too.
            if ($portal = qrRegisterCustomerToProject($pdo, $updated)) {
                qrLogActivity($pdo, $id, $auth, 'client_registered', null, null, $portal);
            }
            if ($granted) qrLogActivity($pdo, $id, $auth, 'portal_access', null, null, (string)$granted);
            qrNotifyUser($pdo, qrFieldUserId($updated), $updated, 'quote_accepted', 'Quote accepted: ' . $title, $updated['facility'], $auth['user_id']);
            if (!empty($updated['project_number'])) {
                notifyProjectStaff($pdo, $updated['project_number'], 'quote_accepted',
                    'Quote accepted: ' . $title, 'Estimate #' . ($updated['estimate_number'] ?? ''), '/projects/' . $updated['project_number']);
            }
            break;

        case 'decline':
            qrNotifyUser($pdo, qrFieldUserId($updated), $updated, 'quote_declined', 'Quote declined: ' . $title, $note, $auth['user_id']);
            break;

        case 'schedule':
            qrNotifyUser($pdo, qrFieldUserId($updated), $updated, 'job_scheduled',
                ($from === 'scheduled' ? 'Job rescheduled: ' : 'Job scheduled: ') . $title, $note, $auth['user_id']);
            break;

        case 'mark_done':
            if (!qrIsAdmin($auth)) {
                qrNotifyOffice($pdo, $updated, 'job_done', 'Job done — ready to invoice: ' . $title, $updated['facility'] ?: $auth['name'], $auth['user_id']);
            }
            break;
    }

    $pdo->commit();
    if ($action === 'accept' && !empty($updated['project_number'])) $acceptedProject = $updated['project_number'];
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
}

// Outside the transaction (it's a network call): make sure the project exists
// in Inventory — creating it there if the Estimate # is new — and mirror it
// into project_cache so it shows up for staff and in the client portal right
// away. Best-effort: a failure here doesn't undo the acceptance; the project
// still resolves the next time anyone opens it.
if ($acceptedProject !== null) {
    try {
        $result = inventoryResolveProject($auth['raw_token'], $acceptedProject);
        if ($result['status'] === 200 && !empty($result['data']['project_number'])) {
            // Name the project after the visit's client (and title, if it only
            // has the placeholder name) — kept in Inventory, the source of truth.
            $p = $result['data'];
            $customer = qrCustomer($pdo, !empty($updated['customer_id']) ? (int)$updated['customer_id'] : null);
            $name = (string)$p['name'];
            $clientName = $p['client_name'] ?? null;
            if (preg_match('/^Estimate \d{4}$/', $name) && trim((string)$updated['title']) !== '') $name = mb_substr($updated['title'], 0, 150);
            if (empty($clientName) && $customer) $clientName = $customer['name'];
            if (($name !== $p['name'] || $clientName !== ($p['client_name'] ?? null)) && !empty($p['id'])) {
                $put = inventoryRequest('PUT', '/projects/item.php?id=' . (int)$p['id'], $auth['raw_token'], [
                    'name' => $name, 'client_name' => $clientName,
                ]);
                if ($put['status'] === 200) { $result['data']['name'] = $name; $result['data']['client_name'] = $clientName; }
            }
            $pdo->prepare(
                'INSERT INTO project_cache (project_number, name, client_name, client_address, updated_at)
                 VALUES (?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE name = VALUES(name), client_name = VALUES(client_name),
                     client_address = VALUES(client_address), updated_at = NOW()'
            )->execute([
                $result['data']['project_number'], $result['data']['name'],
                $result['data']['client_name'] ?? null, $result['data']['client_address'] ?? null,
            ]);
        }
    } catch (Throwable $e) { /* best-effort, see above */ }
}

// No-PO jobs live on the Calendar too (also a network call, so outside the
// transaction). Best-effort: the change above stands either way, and any
// problem is saved on the request so the office sees it.
$calendarWarning = null;
$eventId = !empty($updated['calendar_event_id']) ? (int)$updated['calendar_event_id'] : null;
$calendarAction = match (true) {
    $action === 'schedule'                                       => 'save',
    in_array($action, ['unschedule', 'cancel'], true) && $eventId => 'delete',
    // Invoicing also completes the event, in case a field manager without
    // Calendar access marked it done.
    in_array($action, ['mark_done', 'undo_done', 'mark_invoiced'], true) && $eventId => 'done',
    default => null,
};
if ($calendarAction !== null) {
    try {
        if ($calendarAction === 'save') {
            [$eventId, $calendarWarning] = calendarSaveJob($auth['raw_token'], $updated);
        } elseif ($calendarAction === 'delete') {
            $calendarWarning = calendarDeleteJob($auth['raw_token'], $eventId);
            if ($calendarWarning === null) $eventId = null;
        } else {
            $calendarWarning = calendarSetDone($auth['raw_token'], $eventId, $action !== 'undo_done');
        }
    } catch (Throwable $e) { $calendarWarning = 'Calendar: ' . $e->getMessage(); }
    $pdo->prepare('UPDATE quote_requests SET calendar_event_id = ?, calendar_sync_error = ? WHERE id = ?')
        ->execute([$eventId, $calendarWarning !== null ? mb_substr($calendarWarning, 0, 255) : null, $id]);
}

echo json_encode(['message' => 'Done', 'status' => $updated['status'], 'calendar_warning' => $calendarWarning]);
