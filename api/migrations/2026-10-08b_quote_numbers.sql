-- ─────────────────────────────────────────────────────────────────────────────
-- JCCS Projects — quote numbers only for saved requests
-- Run once, by hand, against production AFTER 2026-10-08_walk_notes.sql.
--
-- A new site walk is created as an UNSAVED draft (so photos can upload as
-- they're taken) and only gets its Q-number when it's saved (Next / Save /
-- Submit, or created from the office form). Cancelling an unsaved walk deletes
-- it, and because numbers come from their own counter rather than the row id,
-- cancelled walks leave no gaps.
--
-- Existing requests keep the number they already show (Q-<id>).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE quote_requests
  ADD COLUMN quote_number INT UNSIGNED NULL AFTER id,
  ADD UNIQUE KEY uq_qr_quote_number (quote_number);

UPDATE quote_requests SET quote_number = id WHERE quote_number IS NULL;
