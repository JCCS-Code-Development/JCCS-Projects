-- ─────────────────────────────────────────────────────────────────────────────
-- JCCS Projects — site-walk notes (Cornell-style walk sheet)
-- Run once, by hand, against production AFTER 2026-10-06_quote_recipients.sql.
--
-- A site walk is captured as a list of short notes ("Exam rm 3 – water damage
-- behind sink") with the photos taken for each note filed under it. The
-- request's description doubles as the sheet's bottom summary.
-- Additive only.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE quote_request_notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quote_request_id INT UNSIGNED NOT NULL,
  client_uid VARCHAR(64) NULL,          -- lets a retried create return the same note
  body TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by INT UNSIGNED NOT NULL,
  created_by_name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_qrn_client_uid (quote_request_id, client_uid),
  INDEX idx_qrn_request (quote_request_id, sort_order)
);

ALTER TABLE quote_request_photos
  ADD COLUMN note_id INT UNSIGNED NULL AFTER quote_request_id,
  ADD INDEX idx_qrp_note (note_id);
