-- ─────────────────────────────────────────────────────────────────────────────
-- JCCS Projects — voice memos on quote requests / site walks
-- Run once, by hand, against production (after the other 2026-10-08 files).
-- Additive only.
--
-- A field manager (or the office) can record short audio clips while walking
-- the site or filling out the estimate — attached to a walk note, or to the
-- request in general (note_id NULL). Files live in uploads/quote-requests/.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE quote_request_audio (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quote_request_id INT UNSIGNED NOT NULL,
  note_id INT UNSIGNED NULL,
  client_uid VARCHAR(64) NULL,            -- retry-safe uploads
  file_path VARCHAR(255) NOT NULL,
  mime VARCHAR(50) NOT NULL,
  duration_sec SMALLINT UNSIGNED NULL,
  peaks VARCHAR(400) NULL,                -- waveform levels 0-100, comma-separated (WhatsApp-style bubble)
  uploaded_by INT UNSIGNED NOT NULL,
  uploaded_by_name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_qra_client_uid (quote_request_id, client_uid),
  INDEX idx_qraudio_request (quote_request_id),
  INDEX idx_qraudio_note (note_id)
);
