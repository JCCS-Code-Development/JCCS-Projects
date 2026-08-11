<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Read-only, scoped strictly to client_project_access — same shape as
// portal/daily-logs.php. No POST/PUT/DELETE verb on this endpoint at all.
$auth = requireClientAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

if (empty($auth['projects'])) { echo json_encode(['weeklyReports' => []]); exit; }

$pdo = getPDO();

$projects = $auth['projects'];
if (!empty($_GET['project_number'])) {
    $projects = in_array($_GET['project_number'], $auth['projects'], true) ? [$_GET['project_number']] : [];
}
if (empty($projects)) { echo json_encode(['weeklyReports' => []]); exit; }

$placeholders = implode(',', array_fill(0, count($projects), '?'));
$stmt = $pdo->prepare(
    "SELECT wr.*,
        (SELECT COUNT(*) FROM daily_logs dl WHERE dl.project_number = wr.project_number
            AND dl.log_date BETWEEN wr.week_start AND wr.week_end) AS daily_log_count
     FROM weekly_reports wr WHERE wr.project_number IN ($placeholders)
     ORDER BY wr.week_start DESC, wr.id DESC LIMIT 100"
);
$stmt->execute($projects);
$reports = $stmt->fetchAll();

if ($reports) {
    $phaseIds = array_values(array_filter(array_unique(array_column($reports, 'phase_id'))));
    $phases = [];
    if ($phaseIds) {
        $phPlaceholders = implode(',', array_fill(0, count($phaseIds), '?'));
        $phStmt = $pdo->prepare("SELECT id, name, sequence FROM phases WHERE id IN ($phPlaceholders)");
        $phStmt->execute($phaseIds);
        foreach ($phStmt->fetchAll() as $ph) { $phases[$ph['id']] = $ph; }
    }
    foreach ($reports as &$report) {
        $report['phase_name']     = $report['phase_id'] ? ($phases[$report['phase_id']]['name'] ?? null) : null;
        $report['phase_sequence'] = $report['phase_id'] ? ($phases[$report['phase_id']]['sequence'] ?? null) : null;
        $report['daily_log_count'] = (int)$report['daily_log_count'];
    }
}

echo json_encode(['weeklyReports' => $reports]);
