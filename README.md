# JCCS Projects

A Procore-style project management app for JCCS — daily field logs, weekly
progress reports, versioned project documents, submittals, a punch list, a
project contacts directory, and an in-app + email notification center —
styled to match `jccs-fieldclock` and `jccs-inventory` (same React + Tailwind
stack, layout conventions, own **red** brand palette). See "What's built vs.
scaffolded" below for the one remaining gap (RFIs).

## Stack

- React 19 + Vite 8 + Tailwind 4 + Zustand + react-router-dom v6, PWA via vite-plugin-pwa
- PHP flat-file API (PDO + MySQL), same conventions as FieldClock's/Inventory's `api/`
- Deployed via `.cpanel.yml` to `projects.jccs-services.com`, a sibling subdomain to
  `fieldclock.jccs-services.com` and `inventory.jccs-services.com`

## Two independent auth tracks

**Staff (Admin / PM-Lead)** — same pattern as Inventory. No accounts of its own; the
frontend logs in directly against FieldClock's `/api/auth/login.php` (see
`VITE_FIELDCLOCK_API_BASE_URL`) and reuses the JWT that comes back. Projects' own API
validates that JWT using a **shared `JWT_SECRET`** copied verbatim from FieldClock's
production `api/config/config.php`. Once verified, it looks up the user's
`projects_staff_roles` row (local to this app's own database) for their Projects role
(`admin` or `pm`) — unprovisioned users get 403. PMs are further scoped to specific
projects via `pm_project_access`; admins see everything.

**Clients** — entirely separate. Clients are external customers, not FieldClock users,
so they get a local `clients` table (email + bcrypt password) and their own JWT signed
with a **different secret**, `CLIENT_JWT_SECRET` (generated once, owned only by this
app — never shared with FieldClock or Inventory). A client token can never be mistaken
for a staff token or vice versa. `client_project_access` scopes each client to the
project_number(s) they're allowed to see. The client portal is strictly **read-only** —
there is no create/update/delete verb reachable with a client token anywhere in the API.

## Project data: no local Projects table

jccs-inventory owns the one `projects` table (keyed on the 4-digit Estimate #) that
every JCCS app treats as the source of truth. Projects' backend calls Inventory's
`/projects/*` **server-to-server** (`api/services/inventory_client.php`, plain PHP
cURL) using the requesting staff member's own FieldClock bearer token — this needs
zero changes to Inventory's CORS config, since CORS only governs browser requests.
The frontend only ever talks to this app's own `/api/projects/*`, which is a thin
proxy. Every staff read opportunistically upserts `project_cache` (local, minimal —
name/client fields only), which is what the client portal reads from, since clients
have no FieldClock identity to call Inventory with directly.

## First-time setup

1. Create the `jccs_projects` MySQL database on the server and import `api/schema.sql`.
2. Manually insert at least one admin row so someone can log in and add the rest:
   ```sql
   INSERT INTO projects_staff_roles (fieldclock_user_id, name, role)
   VALUES (<their FieldClock user id>, '<their name>', 'admin');
   ```
3. Copy `api/config/config.example.php` → `api/config/config.php` on the server (never
   commit `config.php` itself — gitignored, same as FieldClock's/Inventory's), and fill
   in:
   - New database credentials.
   - `JWT_SECRET` — paste in **verbatim** from FieldClock's production config. Do not
     generate a new one; it has to match so a FieldClock-issued token validates here too.
   - `CLIENT_JWT_SECRET` — generate a **fresh** one (`php -r "echo bin2hex(random_bytes(32));"`),
     never reuse FieldClock's or any other app's secret.
   - `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`FROM_EMAIL`/`FROM_NAME` — a mailbox
     created in cPanel's Email Accounts works (e.g. `notifications@projects.jccs-services.com`).
     Client-visible updates (new daily logs, documents, submittals, punch items) email
     clients as well as notifying them in-app. Leave `SMTP_HOST` out entirely and email
     just no-ops (logged to `api/mail_outbox.log`, never blocks the request) if you want
     to stand the app up before email is ready.
   - `INVENTORY_API_URL` / `FRONTEND_ORIGIN` / `APP_URL` — already correct in the example
     for the `projects.jccs-services.com` subdomain; adjust only if that changes.
4. To onboard a client: insert into `clients` (bcrypt-hash their password with
   `password_hash()`) and grant project access via `client_project_access`.
5. `npm install && npm run build` locally — `dist/` is committed to this repo (same as
   FieldClock/Inventory), since cPanel's Git Version Control has no Node to build it
   itself. **Any `src/` change needs a fresh `npm run build` + commit of the resulting
   `dist/` diff to actually go live** — pushing source alone does nothing on its own.
6. Deploy via cPanel → Git Version Control → pull, which runs `.cpanel.yml`
   (update the `secure_backups` path for `projects-config.php` to match wherever you
   keep it, and the `DEPLOYPATH`/cPanel username if this is a different account than
   FieldClock/Inventory's).

## Local development

```
npm install
npm run dev
```

The dev server proxies `/api` to `https://projects.jccs-services.com` (see
`vite.config.js`) — point it at a local PHP server instead if you're running the API
locally, e.g.:

```
php -S localhost:8080 -t api
```

and set `VITE_API_BASE_URL=http://localhost:8080` in `.env.local` (gitignored).
`.env.local` can also point `VITE_FIELDCLOCK_API_BASE_URL` at a local mock of
FieldClock's login — see Inventory's `.env.local` for the same pattern.

## What's built vs. scaffolded

- **Built end-to-end, staff + client portal both**:
  - Staff + client auth (unified login, auto-detects which track), project
    picker/lookup (proxied to Inventory), Active/Inactive project tabs.
  - Daily Logs — calendar view, create with required photos, offline queue for
    spotty job-site connectivity, auto-fetched weather/location, two-way comment
    thread, auto-translation of free text to the viewer's language.
  - Weekly Reports — narrative rollups with an auto-computed daily-log count and
    phase snapshot for that week.
  - Documents — five static divisions (Drawings, Scopes, Estimate placeholder,
    Contracts, Permits) with a colored priority row for Estimate + Drawings,
    append-only versioning with full history, file-type thumbnails, and an
    in-page preview (image/PDF/video) with a download action — nothing opens a
    new tab.
  - Submittals — staff review workflow (status, resubmission resets to pending);
    read-only in the client portal.
  - Punch List — either staff or a client can flag an item; only staff move it
    through open → ready for review → closed.
  - Phases — scope-of-work per phase, a read-only client-portal view with a
    blueprint visual-reference strip pulled from Documents.
  - Project Directory — client contacts / administrative JCCS / on-field PMs.
  - Notification center — in-app "pending until resolved/clicked," plus email
    for every client-visible update.
- **Scaffolded (schema + nav placeholder, no endpoints yet)**: RFIs, and the
  Users admin page (currently `projects_staff_roles`/`clients` rows are managed
  by hand in the database — see First-time setup above). Each should follow the
  exact CRUD + `pmProjectScope()` role-gating pattern already established
  throughout `api/`.
