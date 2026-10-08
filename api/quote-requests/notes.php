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

// Site-walk notes (the Cornell-style walk sheet): each note is one area or
// issue, and photos taken for it point at it via quote_request_photos.note_id.
//   POST   {quote_request_id, body?, client_uid?}  add a note (appended)
//   PATCH  ?id=  {body?, sort_order?}               edit
//   DELETE ?id=                                     remove; its photos stay, unfiled
// Same edit rules as photos: field managers while the request is theirs to
// edit, admins until it's closed.
$auth   = requireAuth(QR_ROLES);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

function qrNotesEditable(array $auth, array $row): bool {
    return qrIsAdmin($auth) ? !in_array($row['status'], ['accepted', 'declined', 'cancelled'], true) : qrFieldCanEdit($auth, $row);
}
function qrNoteOut(array $n): array {
    return ['id' => (int)$n['id'], 'body' => $n['body'], 'sort_order' => (int)$n['sort_order'],
            'created_by_name' => $n['created_by_name'], 'created_at' => $n['created_at'], 'updated_at' => $n['updated_at']];
}

if ($method === 'POST') {
    $body = jsonBody();
    $requestId = (int)($body['quote_request_id'] ?? 0);
    if (!$requestId) { http_response_code(422); exit(json_encode(['error' => 'Missing quote_request_id'])); }
    $row = qrLoadVisible($pdo, $auth, $requestId);
    if (!qrNotesEditable($auth, $row)) { http_response_code(409); exit(json_encode(['error' => 'Notes can no longer be added to this request'])); }

    $uid = isset($body['client_uid']) ? mb_substr(trim((string)$body['client_uid']), 0, 64) : '';
    if ($uid !== '') {
        $s = $pdo->prepare('SELECT * FROM quote_request_notes WHERE quote_request_id = ? AND client_uid = ?');
        $s->execute([$requestId, $uid]);
        if ($dupe = $s->fetch()) { echo json_encode(['note' => qrNoteOut($dupe), 'duplicate' => true]); exit; }
    }
    $text = isset($body['body']) ? mb_substr(trim((string)$body['body']), 0, 5000) : '';
    $s = $pdo->prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM quote_request_notes WHERE quote_request_id = ?');
    $s->execute([$requestId]);
    $sort = (int)$s->fetchColumn();
    $pdo->prepare('INSERT INTO quote_request_notes (quote_request_id, client_uid, body, sort_order, created_by, created_by_name) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$requestId, $uid !== '' ? $uid : null, $text !== '' ? $text : null, $sort, $auth['user_id'], $auth['name']]);
    $s = $pdo->prepare('SELECT * FROM quote_request_notes WHERE id = ?');
    $s->execute([(int)$pdo->lastInsertId()]);
    echo json_encode(['note' => qrNoteOut($s->fetch())]);

} elseif ($method === 'PATCH' || $method === 'DELETE') {
    $noteId = (int)($_GET['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM quote_request_notes WHERE id = ?');
    $s->execute([$noteId]);
    $note = $s->fetch();
    if (!$note) { http_response_code(404); exit(json_encode(['error' => 'Note not found'])); }
    $row = qrLoadVisible($pdo, $auth, (int)$note['quote_request_id']);
    if (!qrNotesEditable($auth, $row)) { http_response_code(409); exit(json_encode(['error' => 'Notes on this request can no longer be changed'])); }

    if ($method === 'PATCH') {
        $body = jsonBody();
        $sets = []; $params = [];
        if (array_key_exists('body', $body)) {
            $text = mb_substr(trim((string)($body['body'] ?? '')), 0, 5000);
            $sets[] = 'body = ?'; $params[] = $text !== '' ? $text : null;
        }
        if (array_key_exists('sort_order', $body)) { $sets[] = 'sort_order = ?'; $params[] = (int)$body['sort_order']; }
        if ($sets) {
            $params[] = $noteId;
            $pdo->prepare('UPDATE quote_request_notes SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
        }
        echo json_encode(['message' => 'Saved']);
    } else {
        $pdo->beginTransaction();
        $pdo->prepare('UPDATE quote_request_photos SET note_id = NULL WHERE note_id = ?')->execute([$noteId]);
        $pdo->prepare('UPDATE quote_request_audio SET note_id = NULL WHERE note_id = ?')->execute([$noteId]);
        $pdo->prepare('DELETE FROM quote_request_notes WHERE id = ?')->execute([$noteId]);
        $pdo->commit();
        echo json_encode(['message' => 'Deleted']);
    }

} else { http_response_code(405); }
