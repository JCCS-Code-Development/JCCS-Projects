<?php
require_once __DIR__ . '/mailer.php';

// In-app notification only (no email) — used for things like comments,
// where an in-app "pending" badge is enough and email would be noisy.
function notifyClient(PDO $pdo, int $clientId, string $projectNumber, string $type, string $title, ?string $body, string $linkPath): void {
    $pdo->prepare(
        'INSERT INTO notifications (recipient_type, recipient_id, project_number, type, title, body, link_path) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute(['client', $clientId, $projectNumber, $type, $title, $body, $linkPath]);
}

function notifyStaff(PDO $pdo, int $fieldclockUserId, string $projectNumber, string $type, string $title, ?string $body, string $linkPath): void {
    $pdo->prepare(
        'INSERT INTO notifications (recipient_type, recipient_id, project_number, type, title, body, link_path) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute(['staff', $fieldclockUserId, $projectNumber, $type, $title, $body, $linkPath]);
}

// Notifies every staff member provisioned on this project (admins always;
// PMs only if pm_project_access grants them this project_number) — used so
// a client's comment reaches whoever can actually act on it, not just
// whichever admin happens to be looking.
function notifyProjectStaff(PDO $pdo, string $projectNumber, string $type, string $title, ?string $body, string $linkPath): void {
    $stmt = $pdo->prepare(
        "SELECT s.fieldclock_user_id FROM projects_staff_roles s WHERE s.is_active = 1 AND (
             s.role = 'admin' OR EXISTS (
                 SELECT 1 FROM pm_project_access pa WHERE pa.fieldclock_user_id = s.fieldclock_user_id AND pa.project_number = ?
             )
         )"
    );
    $stmt->execute([$projectNumber]);
    foreach ($stmt->fetchAll() as $row) {
        notifyStaff($pdo, (int)$row['fieldclock_user_id'], $projectNumber, $type, $title, $body, $linkPath);
    }
}

// Notifies AND emails every client with access to a project — the one
// trigger that's explicitly required to send an actual email, not just an
// in-app notification (staff uploading/creating something new on a project).
function notifyProjectClients(PDO $pdo, string $projectNumber, string $type, string $title, ?string $body, string $linkPath): void {
    $stmt = $pdo->prepare(
        'SELECT c.id, c.email, c.name FROM clients c
         JOIN client_project_access cpa ON cpa.client_id = c.id
         WHERE cpa.project_number = ? AND c.is_active = 1'
    );
    $stmt->execute([$projectNumber]);
    foreach ($stmt->fetchAll() as $client) {
        notifyClient($pdo, (int)$client['id'], $projectNumber, $type, $title, $body, $linkPath);
        $emailBody = ($body ?? $title) . "\n\nView it in the client portal: " . rtrim(FRONTEND_ORIGIN, '/') . $linkPath;
        sendEmail($client['email'], $title, $emailBody);
    }
}
