<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Staff provisioning — same shape as jccs-inventory's api/users/*.php, just
// against this app's own projects_staff_roles/pm_project_access tables and
// role set (admin/pm instead of admin/specialist/user). The frontend picks
// a real person via a direct browser call to FieldClock's own
// /employees/index.php (see src/api/fieldclockAuth.js) rather than this
// endpoint searching anything — this file only ever deals with fieldclock_user_id
// values the admin already resolved that way (or typed manually).
$auth   = requireAuth();
requireAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

const VALID_ROLES = ['admin', 'pm'];

function attachProjectAccess(PDO $pdo, array $users): array {
    if (!$users) return [];
    $ids = array_column($users, 'fieldclock_user_id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("SELECT fieldclock_user_id, project_number FROM pm_project_access WHERE fieldclock_user_id IN ($placeholders)");
    $stmt->execute($ids);
    $byUser = [];
    foreach ($stmt->fetchAll() as $row) { $byUser[$row['fieldclock_user_id']][] = $row['project_number']; }
    foreach ($users as &$u) { $u['project_numbers'] = $byUser[$u['fieldclock_user_id']] ?? []; }
    return $users;
}

if ($method === 'GET') {
    $stmt = $pdo->query('SELECT * FROM projects_staff_roles ORDER BY name');
    echo json_encode(['users' => attachProjectAccess($pdo, $stmt->fetchAll())]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['fieldclock_user_id', 'name', 'role']);

    $fcId = (int)$body['fieldclock_user_id'];
    $role = $body['role'];
    if (!in_array($role, VALID_ROLES, true)) {
        http_response_code(422); exit(json_encode(['error' => 'Role must be admin or pm']));
    }

    $dupe = $pdo->prepare('SELECT fieldclock_user_id FROM projects_staff_roles WHERE fieldclock_user_id = ?');
    $dupe->execute([$fcId]);
    if ($dupe->fetch()) { http_response_code(422); exit(json_encode(['error' => 'That FieldClock user is already provisioned'])); }

    $email = !empty($body['email']) ? sanitizeString($body['email']) : null;
    $phone = !empty($body['phone']) ? sanitizeString($body['phone']) : null;
    $projectNumbers = is_array($body['project_numbers'] ?? null) ? $body['project_numbers'] : [];

    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO projects_staff_roles (fieldclock_user_id, name, role, email, phone) VALUES (?, ?, ?, ?, ?)')
            ->execute([$fcId, sanitizeString($body['name']), $role, $email, $phone]);

        if ($role === 'pm' && $projectNumbers) {
            $accessStmt = $pdo->prepare('INSERT IGNORE INTO pm_project_access (fieldclock_user_id, project_number) VALUES (?, ?)');
            foreach ($projectNumbers as $pn) {
                if (preg_match('/^\d{4}$/', $pn)) $accessStmt->execute([$fcId, $pn]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        http_response_code(500); exit(json_encode(['error' => 'Could not save the user']));
    }

    echo json_encode(['message' => 'User provisioned']);

} else { http_response_code(405); }
