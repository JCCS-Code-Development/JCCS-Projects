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


// Site-walk photos. POST multipart (file + metadata) adds one; PATCH ?id=
// updates caption/room/category/flags/annotations; DELETE ?id= removes one.
// Field managers can only touch photos while the request is still theirs to
// edit (draft / needs_info); admins until the scope is locked.
const QR_PHOTO_MIME = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/heic' => 'heic', 'image/heif' => 'heic'];
const QR_PHOTO_MAX  = 15 * 1024 * 1024;

$auth   = requireAuth(QR_ROLES);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

function qrPhotoEditable(array $auth, array $row): bool {
    return qrIsAdmin($auth) ? !in_array($row['status'], ['accepted', 'declined', 'cancelled'], true) : qrFieldCanEdit($auth, $row);
}

function qrPhotoMeta(array $src, array &$sets, array &$params, ?PDO $pdo = null, int $requestId = 0): void {
    if (array_key_exists('note_id', $src) && $pdo) {
        $nid = $src['note_id'] === '' || $src['note_id'] === null ? null : (int)$src['note_id'];
        if ($nid) {
            $chk = $pdo->prepare('SELECT id FROM quote_request_notes WHERE id = ? AND quote_request_id = ?');
            $chk->execute([$nid, $requestId]);
            if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Note not found on this request'])); }
        }
        $sets[] = 'note_id = ?'; $params[] = $nid;
    }
    if (array_key_exists('caption', $src))   { $sets[] = 'caption = ?';   $params[] = ($v = trim((string)$src['caption'])) === '' ? null : mb_substr($v, 0, 255); }
    if (array_key_exists('room_key', $src))  { $sets[] = 'room_key = ?';  $params[] = ($v = trim((string)$src['room_key'])) === '' ? null : mb_substr($v, 0, 40); }
    if (array_key_exists('category', $src))  { $sets[] = 'category = ?';  $params[] = ($v = trim((string)$src['category'])) === '' ? null : mb_substr($v, 0, 40); }
    if (array_key_exists('is_before', $src))    { $sets[] = 'is_before = ?';    $params[] = filter_var($src['is_before'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0; }
    if (array_key_exists('is_reference', $src)) { $sets[] = 'is_reference = ?'; $params[] = filter_var($src['is_reference'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0; }
    if (array_key_exists('annotations', $src)) {
        $a = $src['annotations'];
        if (is_string($a)) $a = json_decode($a, true);
        $json = is_array($a) ? json_encode($a) : null;
        if ($json !== null && strlen($json) > 1024 * 1024) { http_response_code(422); exit(json_encode(['error' => 'Annotations too large'])); }
        $sets[] = 'annotations_json = ?'; $params[] = $json;
    }
}

if ($method === 'POST') {
    $requestId = (int)($_POST['quote_request_id'] ?? 0);
    if (!$requestId) { http_response_code(422); exit(json_encode(['error' => 'Missing quote_request_id'])); }
    $row = qrLoadVisible($pdo, $auth, $requestId);
    if (!qrPhotoEditable($auth, $row)) { http_response_code(409); exit(json_encode(['error' => 'Photos can no longer be added to this request'])); }

    // Offline retries: same client_uid ⇒ return the photo already stored.
    $clientUid = isset($_POST['client_uid']) ? mb_substr(trim((string)$_POST['client_uid']), 0, 64) : '';
    if ($clientUid !== '') {
        $s = $pdo->prepare('SELECT id, file_path FROM quote_request_photos WHERE quote_request_id = ? AND client_uid = ?');
        $s->execute([$requestId, $clientUid]);
        if ($dupe = $s->fetch()) { echo json_encode(['id' => (int)$dupe['id'], 'url' => qrFileUrl($dupe['file_path']), 'duplicate' => true]); exit; }
    }

    // Validate everything (incl. note_id) before the file touches the disk,
    // so a rejected upload never leaves an orphaned file behind.
    $metaSets = []; $metaParams = [];
    qrPhotoMeta($_POST, $metaSets, $metaParams, $pdo, $requestId);
    [$tmp, $ext, $original] = qrAcceptUpload(QR_PHOTO_MIME, QR_PHOTO_MAX);
    $path = qrStoreUpload($requestId, $tmp, $ext);

    $sets = array_merge(['quote_request_id = ?', 'client_uid = ?', 'file_path = ?', 'original_filename = ?', 'uploaded_by = ?', 'uploaded_by_name = ?'], $metaSets);
    $params = array_merge([$requestId, $clientUid !== '' ? $clientUid : null, $path, $original, $auth['user_id'], $auth['name']], $metaParams);
    if (!empty($_POST['taken_at'])) { $sets[] = 'taken_at = ?'; $params[] = qrValidDateTime((string)$_POST['taken_at']); }
    if (isset($_POST['latitude'], $_POST['longitude']) && is_numeric($_POST['latitude']) && is_numeric($_POST['longitude'])) {
        $sets[] = 'latitude = ?';  $params[] = round((float)$_POST['latitude'], 6);
        $sets[] = 'longitude = ?'; $params[] = round((float)$_POST['longitude'], 6);
    }
    $cols = array_map(fn($s) => substr($s, 0, strpos($s, ' ')), $sets);
    $pdo->prepare('INSERT INTO quote_request_photos (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')')
        ->execute($params);

    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'url' => qrFileUrl($path)]);

} elseif ($method === 'PATCH' || $method === 'DELETE') {
    $photoId = (int)($_GET['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM quote_request_photos WHERE id = ?');
    $s->execute([$photoId]);
    $photo = $s->fetch();
    if (!$photo) { http_response_code(404); exit(json_encode(['error' => 'Photo not found'])); }
    $row = qrLoadVisible($pdo, $auth, (int)$photo['quote_request_id']);
    if (!qrPhotoEditable($auth, $row)) { http_response_code(409); exit(json_encode(['error' => 'Photos on this request can no longer be changed'])); }

    if ($method === 'PATCH') {
        $sets = []; $params = [];
        qrPhotoMeta(jsonBody(), $sets, $params, $pdo, (int)$photo['quote_request_id']);
        if ($sets) {
            $params[] = $photoId;
            $pdo->prepare('UPDATE quote_request_photos SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
        }
        echo json_encode(['message' => 'Saved']);
    } else {
        $pdo->prepare('DELETE FROM quote_request_photos WHERE id = ?')->execute([$photoId]);
        @unlink(__DIR__ . '/../uploads/' . $photo['file_path']);
        echo json_encode(['message' => 'Deleted']);
    }

} else { http_response_code(405); }
