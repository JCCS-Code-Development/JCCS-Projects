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

// Voice memos: short audio clips recorded on a site walk (attached to a walk
// note, or to the request in general) or while filling out the estimate.
//   POST multipart {quote_request_id, file, note_id?, duration?, client_uid?}
//   DELETE ?id=
// Same edit rules as photos: field managers while the request is theirs to
// edit, admins until it's closed. Retries with the same client_uid return
// the stored memo instead of duplicating it.
const QR_AUDIO_MIME = [
    'audio/mp4' => 'm4a', 'audio/x-m4a' => 'm4a', 'audio/aac' => 'aac', 'audio/mpeg' => 'mp3',
    'audio/webm' => 'webm', 'video/webm' => 'webm', 'audio/ogg' => 'ogg', 'audio/wav' => 'wav', 'audio/x-wav' => 'wav',
    'video/mp4' => 'm4a', // iOS Safari's MediaRecorder output is often sniffed as video/mp4
];
const QR_AUDIO_MAX = 25 * 1024 * 1024;

$auth   = requireAuth(QR_ROLES);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

function qrAudioEditable(array $auth, array $row): bool {
    return qrIsAdmin($auth) ? !in_array($row['status'], ['accepted', 'declined', 'cancelled'], true) : qrFieldCanEdit($auth, $row);
}

if ($method === 'POST') {
    $requestId = (int)($_POST['quote_request_id'] ?? 0);
    if (!$requestId) { http_response_code(422); exit(json_encode(['error' => 'Missing quote_request_id'])); }
    $row = qrLoadVisible($pdo, $auth, $requestId);
    if (!qrAudioEditable($auth, $row)) { http_response_code(409); exit(json_encode(['error' => 'Voice memos can no longer be added to this request'])); }

    $uid = isset($_POST['client_uid']) ? mb_substr(trim((string)$_POST['client_uid']), 0, 64) : '';
    if ($uid !== '') {
        $s = $pdo->prepare('SELECT id, file_path FROM quote_request_audio WHERE quote_request_id = ? AND client_uid = ?');
        $s->execute([$requestId, $uid]);
        if ($dupe = $s->fetch()) { echo json_encode(['id' => (int)$dupe['id'], 'url' => qrFileUrl($dupe['file_path']), 'duplicate' => true]); exit; }
    }
    // Validate before the file touches the disk.
    $noteId = !empty($_POST['note_id']) ? (int)$_POST['note_id'] : null;
    if ($noteId) {
        $chk = $pdo->prepare('SELECT id FROM quote_request_notes WHERE id = ? AND quote_request_id = ?');
        $chk->execute([$noteId, $requestId]);
        if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Note not found on this request'])); }
    }
    // Waveform for the voice bubble: up to 64 levels, each 0-100.
    $peaks = null;
    if (!empty($_POST['peaks'])) {
        $vals = array_slice(array_map(fn($v) => max(0, min(100, (int)$v)), explode(',', (string)$_POST['peaks'])), 0, 64);
        $peaks = $vals ? implode(',', $vals) : null;
    }
    $duration = isset($_POST['duration']) && is_numeric($_POST['duration']) ? max(0, min(3600, (int)round((float)$_POST['duration']))) : null;

    [$tmp, $ext] = qrAcceptUpload(QR_AUDIO_MIME, QR_AUDIO_MAX);
    $mime = finfo_file(finfo_open(FILEINFO_MIME_TYPE), $tmp) ?: 'audio/mp4';
    $path = qrStoreUpload($requestId, $tmp, $ext);
    $pdo->prepare('INSERT INTO quote_request_audio (quote_request_id, note_id, client_uid, file_path, mime, duration_sec, peaks, uploaded_by, uploaded_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$requestId, $noteId, $uid !== '' ? $uid : null, $path, $mime === 'video/mp4' ? 'audio/mp4' : $mime, $duration, $peaks, $auth['user_id'], $auth['name']]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'url' => qrFileUrl($path)]);

} elseif ($method === 'DELETE') {
    $s = $pdo->prepare('SELECT * FROM quote_request_audio WHERE id = ?');
    $s->execute([(int)($_GET['id'] ?? 0)]);
    $memo = $s->fetch();
    if (!$memo) { http_response_code(404); exit(json_encode(['error' => 'Voice memo not found'])); }
    $row = qrLoadVisible($pdo, $auth, (int)$memo['quote_request_id']);
    if (!qrAudioEditable($auth, $row)) { http_response_code(409); exit(json_encode(['error' => 'Voice memos on this request can no longer be changed'])); }
    $pdo->prepare('DELETE FROM quote_request_audio WHERE id = ?')->execute([(int)$memo['id']]);
    @unlink(__DIR__ . '/../uploads/' . $memo['file_path']);
    echo json_encode(['message' => 'Deleted']);

} else { http_response_code(405); }
