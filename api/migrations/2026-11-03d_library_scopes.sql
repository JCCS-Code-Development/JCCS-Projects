-- ─────────────────────────────────────────────────────────────────────────────
-- JCCS Projects — teach the estimate writer from the Materials library (2026-11-03)
-- Run once, by hand, against production BEFORE deploying the code that uses
-- it. This app has no migration tooling. Additive only.
--
-- A library entry with scope wording is "taught": when a site visit's notes
-- mention its name or one of its aliases, "Generate estimate text" writes its
-- sections, with the quantity measured from the notes.
--   aliases     words crews use for it, comma-separated ("lvp, vinyl plank")
--   unit        SF | LF | EA — how it's measured (NULL = not measured)
--   scope_text  one bullet per line; "# Heading" starts a section;
--               {amount} {where} {name} are filled in
--   checks      Fit & Finish lines, one per line
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE quote_library
  ADD COLUMN aliases VARCHAR(255) NULL AFTER notes,
  ADD COLUMN unit VARCHAR(5) NULL AFTER aliases,
  ADD COLUMN scope_text TEXT NULL AFTER unit,
  ADD COLUMN checks TEXT NULL AFTER scope_text;

-- The first lesson: LVP flooring.
INSERT INTO quote_library (kind, label, aliases, unit, scope_text, checks) VALUES
  ('flooring', 'LVP flooring', 'lvp, luxury vinyl plank, luxury vinyl, vinyl plank, lvt', 'SF',
   '# Subfloor Preparation\nClean and prepare the existing substrate to receive the new flooring.\nRemove loose materials, residual adhesive, and surface contaminants as required.\nPatch and level minor substrate imperfections as necessary to provide a suitable installation surface.\n# LVP Flooring Installation\nProvide and install {amount}approved luxury vinyl plank flooring{where}.\nInstall the LVP using compatible adhesive or the approved installation system per manufacturer recommendations.\nCoordinate the approved product, color, and plank layout direction before installation.\nCut and fit the flooring neatly around door frames, walls, and fixed components.\nProvide and install transition strips at doorways and changes in flooring as required.',
   'Verify the new flooring is flat, properly aligned, and securely installed with tight seams.\nVerify flooring transitions are smooth, secure, and flush with adjacent surfaces.')
ON DUPLICATE KEY UPDATE aliases = VALUES(aliases), unit = VALUES(unit), scope_text = VALUES(scope_text), checks = VALUES(checks), is_active = 1;
