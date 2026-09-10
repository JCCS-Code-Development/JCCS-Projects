<?php
// GET /api/projects/board-summary.php?numbers=1234,5678
//
// Read-only project status for the JCCS Calendar Operations Board. No login
// (the board runs unattended on a TV): accepts a shared service token in the
// X-Board-Token header, matched against OPS_BOARD_TOKEN in config.php.
//
// Returns { summaries: { "1234": { in_projects, last_daily_log,
// open_punch_items, current_phase }, ... } } for every requested number
// (in_projects=false when this app has never seen it). No writes.
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    exit(json_encode(['error' => 'Method not allowed']));
}

$expected = defined('OPS_BOARD_TOKEN') ? (string) OPS_BOARD_TOKEN : '';
$given    = (string) ($_SERVER['HTTP_X_BOARD_TOKEN'] ?? '');
if ($expected === '' || $expected === 'CHANGE_ME' || !hash_equals($expected, $given)) {
    http_response_code(401);
    exit(json_encode(['error' => 'Invalid board token']));
}

$numbers = array_values(array_unique(array_filter(
    array_map('trim', explode(',', (string) ($_GET['numbers'] ?? ''))),
    static fn($n) => preg_match('/^\d{4}$/', $n) === 1
)));

$out = [];
if ($numbers) {
    $pdo = getPDO();
    $in  = implode(',', array_fill(0, count($numbers), '?'));

    $known = [];
    $s = $pdo->prepare("SELECT project_number FROM project_cache WHERE project_number IN ($in)");
    $s->execute($numbers);
    foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $n) $known[$n] = true;

    $logs = [];
    $s = $pdo->prepare("SELECT project_number, MAX(log_date) d FROM daily_logs WHERE project_number IN ($in) GROUP BY project_number");
    $s->execute($numbers);
    foreach ($s->fetchAll() as $r) $logs[$r['project_number']] = $r['d'];

    $punch = [];
    $s = $pdo->prepare("SELECT project_number, COUNT(*) c FROM punch_items WHERE status <> 'closed' AND project_number IN ($in) GROUP BY project_number");
    $s->execute($numbers);
    foreach ($s->fetchAll() as $r) $punch[$r['project_number']] = (int) $r['c'];

    $phase = [];
    $s = $pdo->prepare("SELECT project_number, name FROM phases WHERE status = 'current' AND project_number IN ($in)");
    $s->execute($numbers);
    foreach ($s->fetchAll() as $r) $phase[$r['project_number']] = $r['name'];

    foreach ($numbers as $n) {
        $out[$n] = [
            'in_projects'      => isset($known[$n]),
            'last_daily_log'   => $logs[$n]  ?? null,
            'open_punch_items' => $punch[$n] ?? 0,
            'current_phase'    => $phase[$n] ?? null,
        ];
    }
}

echo json_encode(['summaries' => (object) $out]);
