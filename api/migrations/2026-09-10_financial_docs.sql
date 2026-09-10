-- ─────────────────────────────────────────────────────────────────────────────
-- JCCS Projects — estimates & invoices depot
-- Run once, by hand, against the production `jccs_projects` database.
--
-- Additive: the `documents` table gains an 'invoice' category (it already had
-- 'estimate') and a handful of nullable financial-metadata columns. Nothing
-- existing is rewritten — every current document keeps working unchanged.
-- Estimates & invoices are just documents in their own categories, so they
-- reuse append-only versioning, preview, history, project scoping and
-- notifications for free.
--
-- Reserved project number '0000' is the "Unfiled" tray: a doc the email
-- ingest couldn't confidently match to a real project lands there for a
-- person to reassign.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE documents
  MODIFY category ENUM('drawing','scope','estimate','contract','permit','invoice') NOT NULL;

ALTER TABLE documents
  ADD COLUMN doc_number       VARCHAR(60)   NULL AFTER title,
  ADD COLUMN amount           DECIMAL(12,2) NULL AFTER doc_number,
  ADD COLUMN issue_date       DATE          NULL AFTER amount,
  ADD COLUMN due_date         DATE          NULL AFTER issue_date,
  ADD COLUMN doc_status       VARCHAR(20)   NULL AFTER due_date,   -- draft|sent|paid|void|accepted (free text)
  ADD COLUMN source           ENUM('manual','email','api') NOT NULL DEFAULT 'manual' AFTER doc_status,
  ADD COLUMN match_confidence VARCHAR(10)   NULL AFTER source;     -- high | low | none  (email ingest only)

-- Speeds the per-project "Estimates & Invoices" tab and the Unfiled tray.
ALTER TABLE documents
  ADD KEY idx_documents_financial (category, project_number, is_active);

-- The Unfiled bucket. project_cache rows are normally mirrored from Inventory;
-- this one is local and permanent so the FK-free project_number reference in
-- `documents` always resolves for the tray.
INSERT INTO project_cache (project_number, name, is_active, status)
VALUES ('0000', 'Unfiled — needs a project', 0, 'inactive')
ON DUPLICATE KEY UPDATE name = VALUES(name);
