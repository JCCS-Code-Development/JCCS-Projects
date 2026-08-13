<?php
// ─────────────────────────────────────────────────
// JCCS Projects — server configuration TEMPLATE
// Copy this to config.php on the server (never commit config.php itself —
// it's gitignored, same as FieldClock's / Inventory's). Protect with
// .htaccess: Deny from all
// ─────────────────────────────────────────────────

// Database — Projects' OWN separate database, not FieldClock's or Inventory's.
define('DB_HOST', 'localhost');
define('DB_NAME', 'jccs_projects');
define('DB_USER', 'projects_user');
define('DB_PASS', 'CHANGE_ME');

// Staff JWT — MUST be copied verbatim from FieldClock's production
// config.php (api/config/config.php, JWT_SECRET constant) so a token issued
// by FieldClock's login validates here too. Do not generate a new one.
define('JWT_SECRET', 'COPY_FROM_FIELDCLOCK_CONFIG_PHP');

// Client-portal JWT — a SEPARATE secret Projects generates and owns itself,
// used only for tokens issued by client-login.php. Never share this value
// with FieldClock or any other app; it must never be interchangeable with
// JWT_SECRET above.
define('CLIENT_JWT_SECRET', 'GENERATE_WITH_bin2hex_random_bytes_32');
define('CLIENT_JWT_EXPIRY', 900); // 15 min, same as FieldClock's staff tokens

// Server-to-server proxy target for jccs-inventory's Projects API. No CORS
// implications — this is a PHP cURL call, not a browser request, so
// inventory's origin allowlist never needs to know about this app.
define('INVENTORY_API_URL', 'https://inventory.jccs-services.com/api');

// Outbound email — new document/submittal/punch-item/daily-log/weekly-report
// updates notify clients in-app AND by email (see services/notify.php);
// services/mailer.php sends over raw SMTP (SSL), no external library. Leave
// SMTP_HOST blank/undefined for local dev — sendEmail() silently no-ops
// and every attempt still lands in api/mail_outbox.log either way. A
// mailbox created in cPanel's Email Accounts works fine here (e.g.
// notifications@projects.jccs-services.com) — same as FieldClock's setup.
define('SMTP_HOST', 'mail.jccs-services.com');
define('SMTP_PORT', 465);
define('SMTP_USER', 'notifications@projects.jccs-services.com');
define('SMTP_PASS', 'CHANGE_ME');
define('FROM_EMAIL', 'notifications@projects.jccs-services.com');
define('FROM_NAME', 'JCCS Projects');

// App
define('FRONTEND_ORIGIN', 'https://projects.jccs-services.com');

// The API's own public base URL — used to build absolute URLs for uploaded
// daily-log photos / document versions (api/uploads/...). No trailing slash.
define('APP_URL', 'https://projects.jccs-services.com/api');
