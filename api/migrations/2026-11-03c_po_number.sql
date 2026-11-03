-- ─────────────────────────────────────────────────────────────────────────────
-- JCCS Projects — the client's PO # on accepted estimates (2026-11-03)
-- Run once, by hand, against production BEFORE deploying the code that uses
-- it. This app has no migration tooling. Additive only.
--
-- An estimate that needs a PO is only accepted once its PO # is entered.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE quote_requests
  ADD COLUMN po_number VARCHAR(40) NULL AFTER estimate_number,
  ADD INDEX idx_qr_po_number (po_number);
