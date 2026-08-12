<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/../services/notify.php';

// Unlike Submittals, EITHER staff or a client can open a punch item — a
// client walking their own site is a normal source of "this isn't
// finished/right." Status moves (open -> ready_for_review -> closed) stay
// staff-only though; see item.php. This file is the staff side of listing
// and creating; portal/punch-items.php is the client mirror (create + read,
// no status verb at all).
const UPLOAD_DIR       = __DIR__ . '/../uploads/punch-items';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
];

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$scope  = pmProjectScope($auth); // null = admin, unrestricted

function fetchPunchItemsWithPhotos(PDO $pdo, string $sql, array $params): array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $items = $stmt->fetchAll();
    if (!$items) return [];

    $ids = array_column($items, 'id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $photoStmt = $pdo->prepare("SELECT * FROM punch_item_photos WHERE punch_item_id IN ($placeholders) ORDER BY id");
    $photoStmt->execute($ids);
    $photosByItem = [];
    foreach ($photoStmt->fetchAll() as $p) {
        $photosByItem[$p['punch_item_id']][] = [
            'id'    => (int)$p['id'],
            'phase' => $p['phase'],
            'url'   => APP_URL . '/uploads/' . $p['file_path'],
            'uploaded_by_name' => $p['uploaded_by_name'],
            'uploaded_at'      => $p['uploaded_at'],
        ];
    }

    foreach ($items as &$item) {
        $photos = $photosByItem[$item['id']] ?? [];
        $item['before_photos'] = array_values(array_filter($photos, fn($p) => $p['phase'] === 'before'));
        $item['after_photos']  = array_values(array_filter($photos, fn($p) => $p['phase'] === 'after'));
    }
    return $items;
}

if ($method === 'GET') {
    $params = [];
    $sql = 'SELECT * FROM punch_items';
    $where = [];
    if (!empty($_GET['project_number'])) {
        $where[] = 'project_number = ?';
        $params[] = $_GET['project_number'];
    }
    if (!empty($_GET['status']) && in_array($_GET['status'], ['open', 'ready_for_review', 'closed'], true)) {
        $where[] = 'status = ?';
        $params[] = $_GET['status'];
    }
    if ($scope !== null) {
        if (empty($scope)) { echo json_encode(['punchItems' => []]); exit; }
        $placeholders = implode(',', array_fill(0, count($scope), '?'));
        $where[] = "project_number IN ($placeholders)";
        $params = array_merge($params, $scope);
    }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    // Open items first (the actual to-do list), then newest within each status.
    $sql .= " ORDER BY FIELD(status, 'open', 'ready_for_review', 'closed'), created_at DESC LIMIT 300";

    echo json_encode(['punchItems' => fetchPunchItemsWithPhotos($pdo, $sql, $params)]);

} elseif ($method === 'POST') {
    $projectNumber = trim((string)($_POST['project_number'] ?? ''));
    $title         = trim((string)($_POST['title'] ?? ''));
    $description   = !empty($_POST['description']) ? sanitizeString($_POST['description']) : null;
    $locationNote  = !empty($_POST['location_note']) ? sanitizeString($_POST['location_note']) : null;
    $dueDate       = !empty($_POST['due_date']) ? trim((string)$_POST['due_date']) : null;

    if ($projectNumber === '' || $title === '') {
        http_response_code(422); exit(json_encode(['error' => 'Missing required field']));
    }
    if (!preg_match('/^\d{4}$/', $projectNumber)) {
        http_response_code(422); exit(json_encode(['error' => 'Estimate # must be exactly 4 digits']));
    }
    if ($scope !== null && !in_array($projectNumber, $scope, true)) {
        http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
    }

    $files = $_FILES['photos'] ?? null;
    if (!$files || empty($files['name'][0])) {
        http_response_code(422); exit(json_encode(['error' => 'At least one photo is required']));
    }
    $count = count($files['name']);
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $validated = [];
    for ($i = 0; $i < $count; $i++) {
        if ($files['error'][$i] !== UPLOAD_ERR_OK) {
            http_response_code(422); exit(json_encode(['error' => 'One of the photos failed to upload']));
        }
        if ($files['size'][$i] > MAX_UPLOAD_BYTES) {
            http_response_code(422); exit(json_encode(['error' => 'Each photo must be 8MB or smaller']));
        }
        $mime = finfo_file($finfo, $files['tmp_name'][$i]);
        if (!isset(ALLOWED_MIME[$mime])) {
            http_response_code(422); exit(json_encode(['error' => 'Photos must be JPEG, PNG, or WebP']));
        }
        $validated[] = ['tmp_name' => $files['tmp_name'][$i], 'ext' => ALLOWED_MIME[$mime]];
    }

    if (!is_dir(UPLOAD_DIR)) { mkdir(UPLOAD_DIR, 0755, true); }

    $movedFiles = [];
    try {
        $pdo->beginTransaction();

        $pdo->prepare(
            'INSERT INTO punch_items (project_number, title, description, location_note, created_by_type, created_by, created_by_name, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$projectNumber, sanitizeString($title), $description, $locationNote, 'staff', $auth['user_id'], $auth['name'], $dueDate]);
        $itemId = (int)$pdo->lastInsertId();

        $photoStmt = $pdo->prepare('INSERT INTO punch_item_photos (punch_item_id, phase, file_path, uploaded_by_type, uploaded_by_name) VALUES (?, ?, ?, ?, ?)');
        foreach ($validated as $file) {
            $filename = "{$itemId}-" . bin2hex(random_bytes(6)) . ".{$file['ext']}";
            $dest = UPLOAD_DIR . '/' . $filename;
            if (!move_uploaded_file($file['tmp_name'], $dest)) {
                throw new RuntimeException('Could not save one of the photos');
            }
            $movedFiles[] = $dest;
            $photoStmt->execute([$itemId, 'before', "punch-items/{$filename}", 'staff', $auth['name']]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        foreach ($movedFiles as $f) { @unlink($f); }
        http_response_code(500); exit(json_encode(['error' => 'Could not save the punch item']));
    }

    notifyProjectClients(
        $pdo, $projectNumber, 'punch_item_created',
        "New punch list item on project #{$projectNumber}",
        $title,
        "/portal/projects/{$projectNumber}?tab=punch-list&item={$itemId}"
    );

    echo json_encode(['id' => $itemId, 'message' => 'Punch item saved']);

} else { http_response_code(405); }
