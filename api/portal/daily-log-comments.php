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

// Client side of the two-way thread — the one write capability anywhere in
// the client portal. Every request is scoped through the LOG's own
// project_number against client_project_access (never trust a bare
// daily_log_id).
$auth   = requireClientAuth();
$method = $_SERVER['REQUEST_METHOD'];
$pdo    = getPDO();

function loadLogProjectPortal(PDO $pdo, int $logId): ?string {
    $stmt = $pdo->prepare('SELECT project_number FROM daily_logs WHERE id = ?');
    $stmt->execute([$logId]);
    $row = $stmt->fetch();
    return $row ? $row['project_number'] : null;
}

if ($method === 'GET') {
    $logId = isset($_GET['daily_log_id']) ? (int)$_GET['daily_log_id'] : 0;
    if (!$logId) { http_response_code(422); exit(json_encode(['error' => 'Missing daily_log_id'])); }

    $projectNumber = loadLogProjectPortal($pdo, $logId);
    if (!$projectNumber || !in_array($projectNumber, $auth['projects'], true)) {
        http_response_code(404); exit(json_encode(['error' => 'Daily log not found']));
    }

    $stmt = $pdo->prepare('SELECT id, author_type, author_name, message, created_at FROM daily_log_comments WHERE daily_log_id = ? ORDER BY created_at ASC');
    $stmt->execute([$logId]);
    echo json_encode(['comments' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['daily_log_id', 'message']);
    $logId = (int)$body['daily_log_id'];
    $message = trim((string)$body['message']);
    if ($message === '') { http_response_code(422); exit(json_encode(['error' => 'Message is required'])); }

    $projectNumber = loadLogProjectPortal($pdo, $logId);
    if (!$projectNumber || !in_array($projectNumber, $auth['projects'], true)) {
        http_response_code(404); exit(json_encode(['error' => 'Daily log not found']));
    }

    $pdo->prepare(
        'INSERT INTO daily_log_comments (daily_log_id, author_type, author_id, author_name, message) VALUES (?, ?, ?, ?, ?)'
    )->execute([$logId, 'client', $auth['client_id'], $auth['name'], sanitizeString($message)]);
    $commentId = (int)$pdo->lastInsertId();

    // A client question should reach whoever can actually answer it —
    // in-app only (email is reserved for staff-created project updates).
    notifyProjectStaff(
        $pdo, $projectNumber, 'comment_added',
        "New question on a daily log — project #{$projectNumber}", $message,
        "/projects/{$projectNumber}?tab=daily-logs&log={$logId}"
    );

    echo json_encode(['id' => $commentId, 'message' => 'Comment posted']);

} else { http_response_code(405); }
