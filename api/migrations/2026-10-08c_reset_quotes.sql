-- ─────────────────────────────────────────────────────────────────────────────
-- JCCS Projects — ONE-TIME RESET of quote requests (test data) → start at Q-0001
--
-- ⚠️ PERMANENTLY deletes every quote request / site walk and everything
-- attached to it: notes, photo records, documents, comments, history,
-- versions, recipients, and their in-app notifications. Run it ONCE, by
-- hand, only while everything in Quotes is still test data, AFTER
-- 2026-10-08b_quote_numbers.sql.
--
-- Not touched: projects, daily logs, documents, users / clients, the
-- materials library.
--
-- The next quote saved after this gets Q-0001 (numbers are MAX + 1).
--
-- The photo / document FILES are not deleted by SQL — afterwards, in cPanel
-- File Manager, empty the folder:
--   public_html/jccs-projects/api/uploads/quote-requests/
-- (keep the folder itself and its .gitkeep).
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM notifications WHERE recipient_type = 'staff' AND link_path LIKE '/quotes/%';

TRUNCATE TABLE quote_request_photos;
TRUNCATE TABLE quote_request_files;
TRUNCATE TABLE quote_request_notes;
TRUNCATE TABLE quote_request_comments;
TRUNCATE TABLE quote_request_activity;
TRUNCATE TABLE quote_request_versions;
TRUNCATE TABLE quote_request_recipients;
TRUNCATE TABLE quote_requests;
