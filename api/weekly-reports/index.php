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

// A higher-level rollup, deliberately NOT a re-typing of what a daily log
// already captures (photos, weather, per-day crew count, location) — see
// schema.sql for the full reasoning. One report per project per week.
$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$scope  = pmProjectScope($auth); // null = admin, unrestricted

function fetchReportsWithExtras(PDO $pdo, string $sql, array $params): array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $reports = $stmt->fetchAll();
    if (!$reports) return [];

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
    return $reports;
}

// Correlated subquery keeps this to one round trip instead of an N+1 loop —
// counts daily logs already on file for that project within the report's
// own week_start/week_end, computed fresh on every read (not stored) so it
// stays accurate even if logs are added after the report is written.
const REPORT_SELECT = "SELECT wr.*,
    (SELECT COUNT(*) FROM daily_logs dl WHERE dl.project_number = wr.project_number
        AND dl.log_date BETWEEN wr.week_start AND wr.week_end) AS daily_log_count
    FROM weekly_reports wr";

if ($method === 'GET') {
    $params = [];
    $sql = REPORT_SELECT;
    $where = [];
    if (!empty($_GET['project_number'])) {
        $where[] = 'wr.project_number = ?';
        $params[] = $_GET['project_number'];
    }
    if ($scope !== null) {
        if (empty($scope)) { echo json_encode(['weeklyReports' => []]); exit; }
        $placeholders = implode(',', array_fill(0, count($scope), '?'));
        $where[] = "wr.project_number IN ($placeholders)";
        $params = array_merge($params, $scope);
    }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY wr.week_start DESC, wr.id DESC LIMIT 100';

    echo json_encode(['weeklyReports' => fetchReportsWithExtras($pdo, $sql, $params)]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['project_number', 'week_start', 'summary']);

    $projectNumber = trim((string)$body['project_number']);
    $weekStartRaw  = trim((string)$body['week_start']);
    $summary       = trim((string)$body['summary']);

    if (!preg_match('/^\d{4}$/', $projectNumber)) {
        http_response_code(422); exit(json_encode(['error' => 'Estimate # must be exactly 4 digits']));
    }
    if ($summary === '') {
        http_response_code(422); exit(json_encode(['error' => 'Progress summary is required']));
    }
    if ($scope !== null && !in_array($projectNumber, $scope, true)) {
        http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
    }

    try {
        $weekStart = new DateTime($weekStartRaw);
    } catch (Throwable $e) {
        http_response_code(422); exit(json_encode(['error' => 'Invalid week start date']));
    }
    $weekEnd = (clone $weekStart)->modify('+6 days');

    $accomplishments = !empty($body['accomplishments']) ? sanitizeString($body['accomplishments']) : null;
    $delaysIssues     = !empty($body['delays_issues'])   ? sanitizeString($body['delays_issues'])   : null;
    $nextWeekPlan     = !empty($body['next_week_plan'])  ? sanitizeString($body['next_week_plan'])  : null;

    $phaseStmt = $pdo->prepare("SELECT id FROM phases WHERE project_number = ? AND status = 'current' LIMIT 1");
    $phaseStmt->execute([$projectNumber]);
    $phaseId = $phaseStmt->fetch()['id'] ?? null;

    try {
        $pdo->prepare(
            'INSERT INTO weekly_reports
                (project_number, week_start, week_end, phase_id, summary, accomplishments, delays_issues, next_week_plan, created_by, created_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $projectNumber, $weekStart->format('Y-m-d'), $weekEnd->format('Y-m-d'), $phaseId,
            sanitizeString($summary), $accomplishments, $delaysIssues, $nextWeekPlan,
            $auth['user_id'], $auth['name'],
        ]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            http_response_code(409); exit(json_encode(['error' => 'A report for this week already exists on this project']));
        }
        throw $e;
    }
    $reportId = (int)$pdo->lastInsertId();

    // Same "update uploaded to the project" trigger as a new daily log —
    // notify + email every client with access to it.
    notifyProjectClients(
        $pdo, $projectNumber, 'weekly_report_created',
        "New weekly report on project #{$projectNumber}",
        $summary,
        "/portal/projects/{$projectNumber}?tab=weekly-reports&report={$reportId}"
    );

    echo json_encode(['id' => $reportId, 'message' => 'Weekly report saved']);

} else { http_response_code(405); }
