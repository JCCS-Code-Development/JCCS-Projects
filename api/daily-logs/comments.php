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

// Staff side of the two-way comment thread on a daily log. Every request is
// scoped through the LOG's own project_number (never trust a bare
// daily_log_id) so a PM can't read/post on a log outside pm_project_access.
$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$scope  = pmProjectScope($auth);

function loadLogProject(PDO $pdo, int $logId): ?string {
    $stmt = $pdo->prepare('SELECT project_number FROM daily_logs WHERE id = ?');
    $stmt->execute([$logId]);
    $row = $stmt->fetch();
    return $row ? $row['project_number'] : null;
}

if ($method === 'GET') {
    $logId = isset($_GET['daily_log_id']) ? (int)$_GET['daily_log_id'] : 0;
    if (!$logId) { http_response_code(422); exit(json_encode(['error' => 'Missing daily_log_id'])); }

    $projectNumber = loadLogProject($pdo, $logId);
    if (!$projectNumber) { http_response_code(404); exit(json_encode(['error' => 'Daily log not found'])); }
    if ($scope !== null && !in_array($projectNumber, $scope, true)) {
        http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
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

    $projectNumber = loadLogProject($pdo, $logId);
    if (!$projectNumber) { http_response_code(404); exit(json_encode(['error' => 'Daily log not found'])); }
    if ($scope !== null && !in_array($projectNumber, $scope, true)) {
        http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
    }

    $pdo->prepare(
        'INSERT INTO daily_log_comments (daily_log_id, author_type, author_id, author_name, message) VALUES (?, ?, ?, ?, ?)'
    )->execute([$logId, 'staff', $auth['user_id'], $auth['name'], sanitizeString($message)]);
    $commentId = (int)$pdo->lastInsertId();

    // A staff reply is worth telling the client about — in-app only,
    // unlike a brand-new daily log, which also emails (see notify.php).
    $stmt = $pdo->prepare(
        'SELECT c.id FROM clients c JOIN client_project_access cpa ON cpa.client_id = c.id
         WHERE cpa.project_number = ? AND c.is_active = 1'
    );
    $stmt->execute([$projectNumber]);
    foreach ($stmt->fetchAll() as $client) {
        notifyClient(
            $pdo, (int)$client['id'], $projectNumber, 'comment_added',
            "New reply on a daily log — project #{$projectNumber}", $message,
            "/portal/projects/{$projectNumber}?tab=daily-logs&log={$logId}"
        );
    }

    echo json_encode(['id' => $commentId, 'message' => 'Comment posted']);

} else { http_response_code(405); }
