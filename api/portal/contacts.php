<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Client-portal mirror of projects/contacts.php — same three columns, same
// read-only shape. Unlike the "assigned client users" pill deliberately
// left off the project header (an account-management detail, not contact
// info), a project Directory listing every client-side stakeholder's name
// and contact info is the whole point of this feature and standard
// practice on a real jobsite — so, unlike that pill, client contacts here
// ARE shown to other client-side viewers on the same project.
$auth = requireClientAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$projectNumber = trim((string)($_GET['project_number'] ?? ''));
if (!preg_match('/^\d{4}$/', $projectNumber) || !in_array($projectNumber, $auth['projects'], true)) {
    http_response_code(403); exit(json_encode(['error' => 'Not assigned to this project']));
}

$pdo = getPDO();

$stmt = $pdo->prepare(
    'SELECT c.name, c.email, c.phone FROM clients c
     JOIN client_project_access cpa ON cpa.client_id = c.id
     WHERE cpa.project_number = ? AND c.is_active = 1 ORDER BY c.name'
);
$stmt->execute([$projectNumber]);
$clientContacts = $stmt->fetchAll();

$stmt = $pdo->query(
    "SELECT name, email, phone FROM projects_staff_roles WHERE role = 'admin' AND is_active = 1 ORDER BY name"
);
$administrativeStaff = $stmt->fetchAll();

$stmt = $pdo->prepare(
    "SELECT s.name, s.email, s.phone FROM projects_staff_roles s
     JOIN pm_project_access pa ON pa.fieldclock_user_id = s.fieldclock_user_id
     WHERE pa.project_number = ? AND s.role = 'pm' AND s.is_active = 1 ORDER BY s.name"
);
$stmt->execute([$projectNumber]);
$fieldManagers = $stmt->fetchAll();

echo json_encode([
    'clientContacts'      => $clientContacts,
    'administrativeStaff' => $administrativeStaff,
    'fieldManagers'       => $fieldManagers,
]);
