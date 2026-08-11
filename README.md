# JCCS Projects

A Procore-style project management app for JCCS — daily field logs, versioned
project documents, RFIs/submittals, and a punch list — styled to match
`jccs-fieldclock` and `jccs-inventory` (same React + Tailwind stack, layout
conventions, own **red** brand palette). Daily Logs is the first fully-built
feature end to end; Documents/RFIs/Submittals/Punch List are scaffolded pages
with the schema ready but no endpoints yet (see `api/schema.sql`).

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
3. Copy `api/config/config.example.php` → `api/config/config.php` on the server, fill
   in the new database credentials, paste in FieldClock's `JWT_SECRET` exactly, and
   generate a fresh `CLIENT_JWT_SECRET` (e.g. `php -r "echo bin2hex(random_bytes(32));"`)
   — do NOT reuse FieldClock's secret for this one.
4. To onboard a client: insert into `clients` (bcrypt-hash their password with
   `password_hash()`) and grant project access via `client_project_access`.
5. `npm install && npm run build`, then deploy via `.cpanel.yml` (update the
   `secure_backups` path for `projects-config.php` to match wherever you keep it).

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

- **Built end-to-end**: staff + client auth, project picker/lookup (proxied),
  Daily Logs (create/list/detail, photo upload, offline queue for spotty job-site
  connectivity), client portal read-only Daily Logs feed.
- **Scaffolded (schema + nav + placeholder page, no endpoints yet)**: Documents
  (versioned uploads), RFIs, Submittals, Punch List, Users (admin management of
  `projects_staff_roles` + `clients`). Each should follow the exact CRUD +
  `pmProjectScope()` role-gating pattern already established in `api/daily-logs/*.php`.
