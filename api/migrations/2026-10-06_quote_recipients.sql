-- ─────────────────────────────────────────────────────────────────────────────
-- JCCS Projects — estimate recipients come from client users
-- Run once, by hand, against production, AFTER 2026-10-05_quote_requests.sql.
--
-- The separate Customers list is retired: the people who get an estimate are
-- client users (the same accounts as the client portal), picked per request.
-- Client users gain a Company field so they can still be grouped/searched by
-- organization (e.g. "Prisma Health").
--
-- Additive only. customers / customer_contacts and quote_requests.customer_id
-- / contact_id are left in place (no longer read or written) so nothing
-- already entered is lost; they can be dropped later.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE clients
  ADD COLUMN company VARCHAR(150) NULL AFTER name;

CREATE TABLE quote_request_recipients (
  quote_request_id INT UNSIGNED NOT NULL,
  client_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (quote_request_id, client_id),
  INDEX idx_qrr_client (client_id)
);
