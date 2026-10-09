-- ─────────────────────────────────────────────────────────────────────────────
-- JCCS Projects — client list (like InvoiceToGo's Clients)
-- Run once, by hand, against production BEFORE deploying the code that uses
-- it. Additive only.
--
-- Brings back the `customers` table (created in 2026-10-05, unused since
-- 2026-10-06) as the billing-client list: who the job is for, with the
-- details InvoiceToGo keeps. Searchable while starting a site visit; the
-- office can import the client list from an InvoiceToGo CSV export.
-- Portal client users (estimate recipients) are unchanged and separate.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE customers
  ADD COLUMN contact_name VARCHAR(150) NULL AFTER name,
  ADD COLUMN mobile VARCHAR(30) NULL AFTER phone,
  MODIFY address VARCHAR(500) NULL,
  ADD COLUMN ship_address VARCHAR(500) NULL AFTER address,
  ADD COLUMN created_by_name VARCHAR(150) NULL AFTER notes;
