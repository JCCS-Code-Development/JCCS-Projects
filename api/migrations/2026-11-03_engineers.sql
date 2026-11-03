-- ─────────────────────────────────────────────────────────────────────────────
-- JCCS Projects — engineer list
-- Run once, by hand, against production BEFORE deploying the code that uses
-- it. Additive only.
--
-- Brings back `customer_contacts` (created 2026-10-05, unused since
-- 2026-10-06) as the engineer list: the person a quote is for, the company
-- (client) they work for and the location they work at. Quotes point at one
-- with the existing quote_requests.contact_id column.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE customer_contacts
  MODIFY customer_id INT UNSIGNED NULL,
  ADD COLUMN location VARCHAR(200) NULL AFTER title,
  ADD COLUMN created_by_name VARCHAR(150) NULL AFTER is_active,
  ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD INDEX idx_contacts_name (name);
