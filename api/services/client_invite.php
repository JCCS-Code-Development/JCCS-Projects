<?php
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/email_template.php';

const CLIENT_SETUP_TOKEN_DAYS = 7;

// Mints a fresh single-use setup/reset token for a client, discarding any
// earlier unused one of the same purpose. Returns the raw token; only its
// SHA-256 hash is stored (client_setup_tokens.token_hash).
function issueClientSetupToken(PDO $pdo, int $clientId, string $purpose = 'setup'): string {
    $pdo->prepare('DELETE FROM client_setup_tokens WHERE client_id = ? AND purpose = ? AND used_at IS NULL')
        ->execute([$clientId, $purpose]);

    $raw     = bin2hex(random_bytes(32));
    $expires = (new DateTimeImmutable('+' . CLIENT_SETUP_TOKEN_DAYS . ' days'))->format('Y-m-d H:i:s');
    $pdo->prepare('INSERT INTO client_setup_tokens (client_id, token_hash, purpose, expires_at) VALUES (?, ?, ?, ?)')
        ->execute([$clientId, hash('sha256', $raw), $purpose, $expires]);

    return $raw;
}

// Sends the "set up your account" invitation. Fire-and-forget, like every
// other mail path — returns false (and logs) if the client is missing or
// has no email address.
function sendClientInvite(PDO $pdo, int $clientId): bool {
    $stmt = $pdo->prepare('SELECT name, email FROM clients WHERE id = ?');
    $stmt->execute([$clientId]);
    $client = $stmt->fetch();
    if (!$client || empty($client['email'])) {
        error_log("sendClientInvite: client $clientId missing or has no email");
        return false;
    }

    // Project names this client can see — gives the invite some context.
    $pStmt = $pdo->prepare(
        'SELECT pc.name FROM client_project_access cpa
         LEFT JOIN project_cache pc ON pc.project_number = cpa.project_number
         WHERE cpa.client_id = ? ORDER BY pc.name'
    );
    $pStmt->execute([$clientId]);
    $projects = array_values(array_filter(array_column($pStmt->fetchAll(), 'name')));

    $token  = issueClientSetupToken($pdo, $clientId, 'setup');
    $origin = rtrim(FRONTEND_ORIGIN, '/');
    $opts = [
        'appName'    => defined('FROM_NAME') && FROM_NAME ? FROM_NAME : 'JCCS Projects',
        'name'       => $client['name'],
        'email'      => $client['email'],
        'projects'   => $projects,
        'setupUrl'   => $origin . '/portal/setup/' . $token,
        'expiryDays' => CLIENT_SETUP_TOKEN_DAYS,
        'logoUrl'    => $origin . '/jccs-logo-white.png',
    ];

    return sendEmail(
        $client['email'],
        'Set up your JCCS Projects client portal account',
        clientInviteEmailText($opts),
        renderClientInviteEmail($opts)
    );
}
