-- With PO / without PO (2026-10-08). Run by hand on production BEFORE
-- deploying the code that uses it (this app has no migration tooling).
--
-- billing: 'po'    → the office writes an estimate in InvoiceToGo (existing flow)
--          'no_po' → no estimate: the office schedules the work (also put on
--                    the Calendar app), it gets marked done, then invoiced.
-- Additive only; existing requests become 'po' (what they were).

ALTER TABLE quote_requests
  MODIFY status ENUM('draft','submitted','needs_info','in_review','approved','estimating','sent','accepted','declined','cancelled',
                     'scheduled','done','invoiced')
         NOT NULL DEFAULT 'draft',
  ADD COLUMN billing ENUM('po','no_po') NOT NULL DEFAULT 'po' AFTER work_type,
  ADD COLUMN scheduled_start DATETIME NULL,
  ADD COLUMN scheduled_end DATETIME NULL,
  ADD COLUMN calendar_sync_error VARCHAR(255) NULL,
  ADD COLUMN completed_at DATETIME NULL,
  ADD COLUMN completed_by_name VARCHAR(100) NULL,
  ADD COLUMN invoice_number VARCHAR(20) NULL,
  ADD COLUMN invoiced_at DATETIME NULL;
