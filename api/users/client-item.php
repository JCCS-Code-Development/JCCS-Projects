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
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

$stmt = $pdo->prepare('SELECT id FROM clients WHERE id = ?');
$stmt->execute([$id]);
if (!$stmt->fetch()) { http_response_code(404); exit(json_encode(['error' => 'Client not found'])); }

if ($method === 'PUT') {
    $body = jsonBody();
    $sets = []; $params = [];

    if (array_key_exists('name', $body) && $body['name'] !== '') {
        $sets[] = 'name = ?'; $params[] = sanitizeString($body['name']);
    }
    if (array_key_exists('phone', $body)) {
        $sets[] = 'phone = ?'; $params[] = $body['phone'] !== '' ? sanitizeString($body['phone']) : null;
    }
    if (array_key_exists('is_active', $body)) {
        $sets[] = 'is_active = ?'; $params[] = (int)$body['is_active'];
    }
    if (!empty($body['password'])) {
        if (strlen((string)$body['password']) < 8) {
            http_response_code(422); exit(json_encode(['error' => 'Password must be at least 8 characters']));
        }
        $sets[] = 'password_hash = ?'; $params[] = password_hash((string)$body['password'], PASSWORD_DEFAULT);
        // A reset password shouldn't inherit a prior lockout.
        $sets[] = 'failed_attempts = 0'; $sets[] = 'locked_until = NULL';
    }

    if ($sets) {
        $params[] = $id;
        $pdo->prepare('UPDATE clients SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    }

    // Full replace, same rationale as users/item.php's project_numbers handling.
    if (is_array($body['project_numbers'] ?? null)) {
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM client_project_access WHERE client_id = ?')->execute([$id]);
            $accessStmt = $pdo->prepare('INSERT IGNORE INTO client_project_access (client_id, project_number) VALUES (?, ?)');
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
    $pdo->prepare('UPDATE clients SET is_active = 0 WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Deactivated']);

} else { http_response_code(405); }
