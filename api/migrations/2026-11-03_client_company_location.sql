-- ─────────────────────────────────────────────────────────────────────────────
-- JCCS Projects — clients carry their company and location (2026-11-03)
-- Run once, by hand, against production BEFORE deploying the code that uses
-- it. Needs 2026-10-09_client_list.sql first (it adds created_by_name etc.).
-- Additive only.
--
-- A client is who the quote is for — often a person (an engineer at
-- Prisma Health), sometimes a company. `company` is who they work for and
-- `location` the facility they work at; both are optional.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE customers
  ADD COLUMN company VARCHAR(150) NULL AFTER contact_name,
  ADD COLUMN location VARCHAR(200) NULL AFTER company,
  ADD INDEX idx_customers_company (company);
