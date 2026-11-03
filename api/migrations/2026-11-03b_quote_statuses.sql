-- ─────────────────────────────────────────────────────────────────────────────
-- JCCS Projects — simpler quote statuses (2026-11-03)
-- Run once, by hand, against production BEFORE deploying the code that uses
-- it, and AFTER 2026-11-03_client_company_location.sql. This app has no migration tooling.
--
-- With a PO:  draft → pending_review → estimate_created → sent → accepted / declined
--   pending_review   = sent in by anyone, waiting for the office
--   estimate_created = the office typed the InvoiceToGo Estimate # in, but its
--                      PDF hasn't reached the depot mailbox yet
--   sent             = a PDF with that Estimate # came in through the depot
-- Without a PO (unchanged): scheduled → done → invoiced.
--
-- Old statuses move over: submitted / in_review / approved → pending_review,
-- estimating → estimate_created. Nothing else changes.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Allow the new values next to the old ones.
ALTER TABLE quote_requests
  MODIFY status ENUM('draft','submitted','needs_info','in_review','approved','estimating','sent','accepted','declined','cancelled',
                     'scheduled','done','invoiced','pending_review','estimate_created')
         NOT NULL DEFAULT 'draft';

-- 2. Move every quote onto them.
UPDATE quote_requests SET status = 'pending_review'   WHERE status IN ('submitted', 'in_review', 'approved');
UPDATE quote_requests SET status = 'estimate_created' WHERE status = 'estimating';

-- 3. Drop the old values.
ALTER TABLE quote_requests
  MODIFY status ENUM('draft','pending_review','needs_info','estimate_created','sent','accepted','declined','cancelled',
                     'scheduled','done','invoiced')
         NOT NULL DEFAULT 'draft';
