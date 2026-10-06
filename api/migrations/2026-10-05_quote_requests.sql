-- ─────────────────────────────────────────────────────────────────────────────
-- JCCS Projects — Site Walks & Quote Requests
-- Run once, by hand, against the production `jccs_projects` database (no
-- migration tooling). Additive only: one ENUM widening on
-- projects_staff_roles, everything else is new tables.
--
-- Flow: a field manager (new 'field' role) documents a job on a site walk →
-- submits → an admin reviews/edits the generated Scope of Work, approves it,
-- copies it into InvoiceToGo (which still prices + sends the estimate) →
-- the IT2G PDF comes back through the existing email ingest → admin marks
-- the request accepted/declined.
-- ─────────────────────────────────────────────────────────────────────────────

-- Field managers: FieldClock users who can create site walks and see only
-- their own requests. Every pre-existing endpoint rejects them (requireAuth()
-- defaults to admin/pm only).
ALTER TABLE projects_staff_roles
  MODIFY role ENUM('admin','pm','field') NOT NULL;

-- Reusable customer list (an organization, e.g. "Prisma Health") with any
-- number of contacts — the "For:" person on an estimate varies per job.
CREATE TABLE customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(190) NULL,
  address VARCHAR(255) NULL,
  notes TEXT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customers_name (name)
);

CREATE TABLE customer_contacts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  title VARCHAR(100) NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(30) NULL,
  address VARCHAR(255) NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contacts_customer (customer_id)
);

-- One row per quote request / site walk. request # shown as Q-0001 (derived
-- from id, not stored). form_json holds the structured site-walk answers the
-- scope generator reads; scope_text is the current (possibly hand-edited)
-- Scope of Work that gets copied into InvoiceToGo.
CREATE TABLE quote_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  status ENUM('draft','submitted','needs_info','in_review','approved','estimating','sent','accepted','declined','cancelled')
         NOT NULL DEFAULT 'draft',
  work_type ENUM('new','addon') NOT NULL DEFAULT 'new',
  estimate_type VARCHAR(20) NOT NULL DEFAULT 'standard', -- standard|addon|emergency|alternative|line_item
  title VARCHAR(200) NOT NULL,
  customer_id INT UNSIGNED NULL,
  contact_id INT UNSIGNED NULL,
  facility VARCHAR(200) NULL,
  location_detail VARCHAR(255) NULL,           -- building / floor / department / suite
  project_number VARCHAR(4) NULL,              -- add-ons: the existing project
  original_estimate_no VARCHAR(20) NULL,       -- add-ons: the estimate being added to
  related_ref VARCHAR(60) NULL,                -- related project / PO #
  estimate_number VARCHAR(20) NULL,            -- InvoiceToGo Estimate #, typed in when estimating
  description TEXT NULL,                       -- intake notes / field description
  request_source VARCHAR(20) NULL,             -- email|text|phone|site_meeting|work_order|other
  priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  needed_by DATE NULL,
  site_visit_date DATE NULL,                   -- date the site walk happened
  site_visit_at DATETIME NULL,                 -- scheduled site visit (Calendar event)
  calendar_event_id INT UNSIGNED NULL,
  field_manager_id INT UNSIGNED NULL,          -- who does / did the site walk
  field_manager_name VARCHAR(150) NULL,
  assigned_to INT UNSIGNED NULL,               -- estimator (admin)
  assigned_to_name VARCHAR(150) NULL,
  form_json LONGTEXT NULL,
  scope_text MEDIUMTEXT NULL,
  follow_up_days SMALLINT UNSIGNED NOT NULL DEFAULT 7,
  decline_reason VARCHAR(255) NULL,
  document_id INT UNSIGNED NULL,               -- the filed IT2G estimate PDF (documents.id)
  created_by INT UNSIGNED NOT NULL,
  created_by_name VARCHAR(150) NOT NULL,
  submitted_at DATETIME NULL,
  approved_at DATETIME NULL,
  approved_by_name VARCHAR(150) NULL,
  sent_at DATETIME NULL,
  decided_at DATETIME NULL,
  last_reminded_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_qr_status (status),
  INDEX idx_qr_field_manager (field_manager_id),
  INDEX idx_qr_created_by (created_by),
  INDEX idx_qr_estimate_number (estimate_number),
  INDEX idx_qr_project (project_number)
);

-- Append-only snapshots of the form + scope: the original field submission,
-- each saved scope edit, the approved (locked) version.
CREATE TABLE quote_request_versions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quote_request_id INT UNSIGNED NOT NULL,
  kind ENUM('field_submission','scope_edit','approved') NOT NULL,
  form_json LONGTEXT NULL,
  scope_text MEDIUMTEXT NULL,
  note VARCHAR(255) NULL,
  created_by INT UNSIGNED NOT NULL,
  created_by_name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_qrv_request (quote_request_id)
);

-- Who did what, when: status changes, assignments, estimate # entry.
CREATE TABLE quote_request_activity (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quote_request_id INT UNSIGNED NOT NULL,
  action VARCHAR(40) NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NULL,
  note VARCHAR(500) NULL,
  actor_id INT UNSIGNED NOT NULL,
  actor_name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_qra_request (quote_request_id)
);

-- Internal thread between field manager and office. Never part of the
-- generated scope. info_request = admin asking the field for missing details.
CREATE TABLE quote_request_comments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quote_request_id INT UNSIGNED NOT NULL,
  kind ENUM('note','info_request','info_response') NOT NULL DEFAULT 'note',
  body TEXT NOT NULL,
  author_id INT UNSIGNED NOT NULL,
  author_name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_qrc_request (quote_request_id)
);

-- Site-walk photos. client_uid lets an offline-queued upload be retried
-- without creating a duplicate. annotations_json = arrows/circles/text drawn
-- over the photo (rendered client-side).
CREATE TABLE quote_request_photos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quote_request_id INT UNSIGNED NOT NULL,
  client_uid VARCHAR(64) NULL,
  file_path VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  room_key VARCHAR(40) NULL,
  category VARCHAR(40) NULL,
  caption VARCHAR(255) NULL,
  is_before TINYINT(1) DEFAULT 0,
  is_reference TINYINT(1) DEFAULT 0,
  annotations_json MEDIUMTEXT NULL,
  taken_at DATETIME NULL,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  uploaded_by INT UNSIGNED NOT NULL,
  uploaded_by_name VARCHAR(150) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_qrp_client_uid (quote_request_id, client_uid),
  INDEX idx_qrp_request (quote_request_id)
);

-- Plans, sketches, product data, client emails, ICRA docs, etc.
CREATE TABLE quote_request_files (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quote_request_id INT UNSIGNED NOT NULL,
  kind VARCHAR(30) NOT NULL DEFAULT 'other',
  file_path VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  uploaded_by INT UNSIGNED NOT NULL,
  uploaded_by_name VARCHAR(150) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_qrf_request (quote_request_id)
);

-- Admin-editable library of commonly used materials/finishes the site-walk
-- form offers as one-tap picks (so new finishes never need a code change).
CREATE TABLE quote_library (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(30) NOT NULL,          -- paint_color|laminate|solid_surface|flooring|cove_base|film|ceiling_tile|other
  label VARCHAR(150) NOT NULL,
  manufacturer VARCHAR(100) NULL,
  product_code VARCHAR(60) NULL,
  notes VARCHAR(255) NULL,
  is_active TINYINT(1) DEFAULT 1,
  use_count INT UNSIGNED DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_library_kind_label (kind, label)
);

INSERT INTO quote_library (kind, label, manufacturer) VALUES
  ('paint_color',   'Canvas Tan',             NULL),
  ('cove_base',     'Moon Rock',              NULL),
  ('solid_surface', 'Rice Paper',             'Corian'),
  ('solid_surface', 'Bleached Concrete',      'Corian'),
  ('solid_surface', 'Pepper Terrazzo',        'Corian'),
  ('laminate',      'Pewter Mesh',            NULL),
  ('laminate',      'Antique White',          NULL),
  ('laminate',      'Sail White',             NULL),
  ('flooring',      'Eternal Pebble Stucco',  'Forbo');
