-- jccs_projects schema
-- Staff identity comes from FieldClock (fieldclock_user_id is the FK
-- everywhere staff are referenced); clients are local accounts. Projects
-- themselves are NOT stored here — jccs-inventory owns that table; this
-- schema only caches display fields (project_cache) for the client portal,
-- which has no FieldClock identity to call Inventory's API with directly.

CREATE TABLE projects_staff_roles (
  fieldclock_user_id INT UNSIGNED PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  role ENUM('admin','pm') NOT NULL,
  -- Contact info for the project Directory (see projects/contacts.php) —
  -- FieldClock is the identity source of truth but doesn't expose a contact
  -- API here, so these are entered locally, same denormalized-contact
  -- approach as clients.phone below.
  email VARCHAR(190) NULL,
  phone VARCHAR(30) NULL,
  is_active TINYINT(1) DEFAULT 1
);

-- Which projects a PM may see/edit. Admins are unrestricted (no rows needed).
CREATE TABLE pm_project_access (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fieldclock_user_id INT UNSIGNED NOT NULL,
  project_number VARCHAR(4) NOT NULL,
  UNIQUE KEY uq_pm_project (fieldclock_user_id, project_number)
);

CREATE TABLE clients (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(30) NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(150) NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  failed_attempts INT UNSIGNED DEFAULT 0,
  locked_until DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE client_project_access (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id INT UNSIGNED NOT NULL,
  project_number VARCHAR(4) NOT NULL,
  UNIQUE KEY uq_client_project (client_id, project_number)
);

-- Mirrors FieldClock's own refresh_tokens table shape, just scoped to clients.
CREATE TABLE client_refresh_tokens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL
);

-- Read-only cache of Inventory's project fields, refreshed opportunistically
-- every time staff hits GET /projects/index.php or /projects/resolve.php.
-- Lets the client portal show project name/address without an Inventory
-- credential of its own.
CREATE TABLE project_cache (
  project_number VARCHAR(4) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  client_name VARCHAR(150) NULL,
  client_address VARCHAR(255) NULL,
  -- Mirrors Inventory's own projects.is_active/status — lets both the staff
  -- home and the client portal home separate active jobs from
  -- inactive/completed ones without a live Inventory call.
  is_active TINYINT(1) DEFAULT 1,
  status VARCHAR(20) DEFAULT 'active',
  -- Geocoded once from client_address (Census geocoder, free/no-key) and
  -- cached here so the weather auto-fetch on daily-log creation doesn't
  -- re-geocode on every single log — only when these are still NULL.
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  geocoded_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Project phases — sequential milestones an admin/PM defines per project
-- (e.g. Design, Permitting, Framing, Finishing). At most one phase per
-- project should be 'current' at a time; item.php enforces that by
-- demoting any other 'current' phase to 'completed' when a new one is set.
CREATE TABLE phases (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_number VARCHAR(4) NOT NULL,
  name VARCHAR(150) NOT NULL,
  -- Scope of work for this phase — what should actually get done, distinct
  -- from the name (a short label like "Framing"). Shows up on the Overview
  -- timeline entry for the phase and is editable from Manage Phases.
  scope TEXT NULL,
  sequence INT UNSIGNED NOT NULL,
  status ENUM('upcoming','current','completed') DEFAULT 'upcoming',
  start_date DATE NULL,
  end_date DATE NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_project_sequence (project_number, sequence)
);

CREATE TABLE daily_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_number VARCHAR(4) NOT NULL,
  log_date DATE NOT NULL,
  -- Auto-filled at creation from the project's geocoded location via
  -- Open-Meteo — never typed by hand. NULL just means the lookup failed
  -- (network hiccup, no address on file); it never blocks saving the log.
  weather VARCHAR(100) NULL,
  -- Whatever phase was 'current' for the project at the moment this log was
  -- created — silently recorded, not a form field. NULL if no phase was
  -- current yet. Deliberately no FK constraint (same loose-reference
  -- convention as project_number) so a later phase deletion can't fail a
  -- write here; item.php resolves the name at read time and tolerates a
  -- dangling id.
  phase_id INT UNSIGNED NULL,
  crew_count INT UNSIGNED NULL,
  work_performed TEXT NOT NULL,
  delays TEXT NULL,
  notes TEXT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project_date (project_number, log_date)
);

CREATE TABLE daily_log_photos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  daily_log_id INT UNSIGNED NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Two-way thread on a daily log — the one write capability the client
-- portal has anywhere. author_name is denormalized (rather than joining
-- against projects_staff_roles OR clients depending on author_type) since
-- the two author tables have nothing in common to join on.
CREATE TABLE daily_log_comments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  daily_log_id INT UNSIGNED NOT NULL,
  author_type ENUM('staff','client') NOT NULL,
  author_id INT UNSIGNED NOT NULL,
  author_name VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_daily_log (daily_log_id)
);

-- Higher-level weekly progress rollup, written by an admin/PM — deliberately
-- NOT a re-typing of what a daily log already captures (photos, weather,
-- per-day crew count, location). One report per project per week
-- (uq_project_week); the daily-log count for that date range is computed at
-- read time (see weekly-reports/index.php), not stored here, so it stays
-- accurate even if logs are added after the report is written.
CREATE TABLE weekly_reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_number VARCHAR(4) NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  -- Whatever phase was 'current' at the moment this report was written —
  -- same silent-snapshot convention as daily_logs.phase_id.
  phase_id INT UNSIGNED NULL,
  summary TEXT NOT NULL,
  accomplishments TEXT NULL,
  delays_issues TEXT NULL,
  next_week_plan TEXT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_by_name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_project_week (project_number, week_start),
  INDEX idx_project_week (project_number, week_start)
);

-- Generic notification, staff or client. "Pending" until the recipient
-- either clicks through to link_path (frontend calls the resolve endpoint
-- on click) or it's explicitly resolved some other way. type is a free-form
-- tag ('daily_log_created', 'comment_added', ...) for icon/copy selection
-- on the frontend, not a hard enum, so new event types don't need a schema
-- change.
CREATE TABLE notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  recipient_type ENUM('staff','client') NOT NULL,
  recipient_id INT UNSIGNED NOT NULL,
  project_number VARCHAR(4) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(255) NULL,
  link_path VARCHAR(255) NOT NULL,
  status ENUM('pending','resolved') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  INDEX idx_recipient (recipient_type, recipient_id, status)
);

-- ── Phase 2 tables (not yet wired to any endpoint — schema is ready so
--    Documents/RFIs/Submittals/Punch List can follow the exact same
--    CRUD+role-gating pattern established by daily-logs/*.php) ──────────

-- Static, fixed set of divisions (not user-creatable) — 'estimate' is a
-- placeholder category with no upload UI yet (estimates will eventually
-- come from jccs-inventory's data instead of a manual upload here).
CREATE TABLE documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_number VARCHAR(4) NOT NULL,
  category ENUM('drawing','scope','estimate','contract','permit') NOT NULL,
  title VARCHAR(200) NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project_category (project_number, category)
);

-- Every upload against a document is append-only (never overwritten) so a
-- full revision history is always available — see documents/versions.php.
CREATE TABLE document_versions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  notes VARCHAR(255) NULL,
  uploaded_by INT UNSIGNED NOT NULL,
  uploaded_by_name VARCHAR(150) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doc_version (document_id, version_number)
);

CREATE TABLE rfis (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_number VARCHAR(4) NOT NULL,
  rfi_number INT UNSIGNED NOT NULL,
  subject VARCHAR(200) NOT NULL,
  question TEXT NOT NULL,
  status ENUM('open','answered','closed') DEFAULT 'open',
  submitted_by INT UNSIGNED NOT NULL,
  due_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_project_rfi (project_number, rfi_number)
);

CREATE TABLE rfi_responses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rfi_id INT UNSIGNED NOT NULL,
  response TEXT NOT NULL,
  attachment_path VARCHAR(255) NULL,
  responded_by INT UNSIGNED NOT NULL,
  responded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- submittal_number is sequential PER PROJECT (assigned in app code as
-- MAX(submittal_number)+1), matching daily_logs' natural-key convention —
-- there's no local `projects` table to hang an AUTO_INCREMENT scope off of.
CREATE TABLE submittals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_number VARCHAR(4) NOT NULL,
  submittal_number INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  spec_section VARCHAR(50) NULL,
  status ENUM('pending','approved','approved_as_noted','revise_resubmit','rejected') DEFAULT 'pending',
  submitted_by INT UNSIGNED NOT NULL,
  submitted_by_name VARCHAR(150) NOT NULL,
  reviewed_by INT UNSIGNED NULL,
  reviewed_by_name VARCHAR(150) NULL,
  reviewed_at TIMESTAMP NULL,
  due_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_project_submittal (project_number, submittal_number)
);

-- Append-only, same versioning convention as document_versions — a full
-- resubmission history survives every review cycle.
CREATE TABLE submittal_versions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  submittal_id INT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  notes VARCHAR(255) NULL,
  uploaded_by INT UNSIGNED NOT NULL,
  uploaded_by_name VARCHAR(150) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_submittal_version (submittal_id, version_number)
);

-- Unlike Submittals (staff-only creation), either side can flag a punch
-- item — a client walking their own site is a completely normal source of
-- "this isn't finished/right" — but only staff move it through
-- open -> ready_for_review -> closed; there's no client-facing status verb
-- anywhere (see portal/punch-items.php). created_by_type/created_by_name
-- follow the same dual-authorship, denormalized-name convention as
-- daily_log_comments, since staff and clients have nothing in common to
-- join against.
CREATE TABLE punch_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_number VARCHAR(4) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  location_note VARCHAR(150) NULL,
  status ENUM('open','ready_for_review','closed') DEFAULT 'open',
  created_by_type ENUM('staff','client') NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_by_name VARCHAR(150) NOT NULL,
  due_date DATE NULL,
  closed_by INT UNSIGNED NULL,
  closed_by_name VARCHAR(150) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP NULL,
  INDEX idx_project_status (project_number, status)
);

-- 'before' photos are required at creation (either author); 'after' photos
-- are added by staff as proof when moving an item toward closed.
CREATE TABLE punch_item_photos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  punch_item_id INT UNSIGNED NOT NULL,
  phase ENUM('before','after') DEFAULT 'before',
  file_path VARCHAR(255) NOT NULL,
  uploaded_by_type ENUM('staff','client') NOT NULL,
  uploaded_by_name VARCHAR(150) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
