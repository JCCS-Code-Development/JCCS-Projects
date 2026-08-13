<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
requireAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
// This table's primary key is the FieldClock user id itself, not a local autoincrement id.
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

if ($method === 'PUT') {
    $body = jsonBody();
    $sets = []; $params = [];

    if (array_key_exists('name', $body) && $body['name'] !== '') {
        $sets[] = 'name = ?'; $params[] = sanitizeString($body['name']);
    }
    if (array_key_exists('email', $body)) {
        $sets[] = 'email = ?'; $params[] = $body['email'] !== '' ? sanitizeString($body['email']) : null;
    }
    if (array_key_exists('phone', $body)) {
        $sets[] = 'phone = ?'; $params[] = $body['phone'] !== '' ? sanitizeString($body['phone']) : null;
    }
    if (array_key_exists('role', $body)) {
        if (!in_array($body['role'], ['admin', 'pm'], true)) {
            http_response_code(422); exit(json_encode(['error' => 'Role must be admin or pm']));
        }
        if ($id === $auth['user_id'] && $body['role'] !== 'admin') {
            http_response_code(422); exit(json_encode(['error' => "You can't demote your own account"]));
        }
        $sets[] = 'role = ?'; $params[] = $body['role'];
    }
    if (array_key_exists('is_active', $body)) {
        if ($id === $auth['user_id'] && !$body['is_active']) {
            http_response_code(422); exit(json_encode(['error' => "You can't deactivate your own account"]));
        }
        $sets[] = 'is_active = ?'; $params[] = (int)$body['is_active'];
    }

    if ($sets) {
        $params[] = $id;
        $pdo->prepare('UPDATE projects_staff_roles SET ' . implode(', ', $sets) . ' WHERE fieldclock_user_id = ?')->execute($params);
    }

    // Project access is a full replace (only meaningful for PMs — admins are
    // unrestricted and never consult pm_project_access at all) so the admin
    // doesn't have to diff an add/remove list themselves each time.
    if (is_array($body['project_numbers'] ?? null)) {
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM pm_project_access WHERE fieldclock_user_id = ?')->execute([$id]);
            $accessStmt = $pdo->prepare('INSERT IGNORE INTO pm_project_access (fieldclock_user_id, project_number) VALUES (?, ?)');
            foreach ($body['project_numbers'] as $pn) {
                if (preg_match('/^\d{4}$/', $pn)) $accessStmt->execute([$id, $pn]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            http_response_code(500); exit(json_encode(['error' => 'Could not update project access']));
        }
    }

    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    if ($id === $auth['user_id']) {
        http_response_code(422); exit(json_encode(['error' => "You can't deactivate your own account"]));
    }
    $pdo->prepare('UPDATE projects_staff_roles SET is_active = 0 WHERE fieldclock_user_id = ?')->execute([$id]);
    echo json_encode(['message' => 'Deactivated']);

} else { http_response_code(405); }
