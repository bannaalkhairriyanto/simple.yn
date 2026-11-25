# AGENTS.md

Simple.yn is a static site (plain HTML/CSS/vanilla JS, no build step) backed by Supabase Auth, Postgres RLS, and a private storage bucket. Copy and errors are Indonesian; keep them that way.

## Layout and deploy boundary

- **Deploy only `site/`.** Root `productivity.html`, `student-helper.html`, `demo-backup/`, `examples/`, `supabase/`, `README.md`, and `SECURITY.md` are legacy/backup/docs and must not be published.
- Public pages: `site/index.html`, `harga.html`, `login.html`, `privasi.html`, `syarat.html`. Gated pages: `site/app/*.html`.
- `site/js/config.js` is the only product/payment config. Prices also live in Supabase `plans`; changing one without the other causes the server to charge its own price (it overwrites the client value).
- Live Supabase project: `pwshbnunqzgsqhidadse` (`Simpleyn`, ap-southeast-1). `site/js/config.js` and the CSP in `site/_headers` must point at the same project origin.

## Commands

- Tests: `node --test tests/security.test.mjs` — `node --test tests/` fails on this Node/Windows setup, always pass the file.
- Local preview: `cd site` then `python -m http.server 8000`, open `http://localhost:8000/`. Never use `file://`: the site uses absolute `/js`, `/css` paths and CSP.
- No lint, typecheck, bundler, or `package.json`. `node --check` per JS file already runs inside the test suite.
- No Supabase CLI is installed. Migrations are applied through the SQL editor or the Supabase MCP tool, in filename order.
- CI (`.github/workflows/ci.yml`) runs the same test command on push and PR.

## Git and deploy

- Remote: `github.com/bannaalkhairriyanto/simple.yn` (**public**), default branch `main`. Because the repo is public, never commit a real secret: the publishable key is fine, `service_role`/PATs/DB passwords are not.
- Cloudflare Pages uses Git integration: **root directory = repo root**, build command `node --test tests/security.test.mjs`, **build output directory = `site`**, production branch `main`. Never set the output to the repo root. The live site is `https://simple-yn.pages.dev`.
- Never deploy this repo through the Workers flow (`npx wrangler deploy`). It guesses an asset directory and picks `demo-backup/`, publishing legacy stubs with no CSP. A `Deploy command`, a generated `wrangler.jsonc`, or a `*.workers.dev` URL means the wrong product was used.
- `site/404.html` is load-bearing: without it Cloudflare Pages answers `200` with the homepage for every unknown path, so out-of-boundary files look reachable. Verify `404` for `/README.md` and `/supabase/...` after deploy.
- `site/_headers` ships as-is and Cloudflare Pages honors it. Keep CSP/HSTS there, not only in the dashboard.
- Deploy only on a green build; the build command runs the security tests, so a broken CSP or inline-script rule fails the deploy.

## Supabase / authorization contract

- **RLS is the only authorization.** Hiding buttons or HTML is never a control.
- Apply migrations **in order**: `001` → `002` → `003` → `004` → `005`. `001`/`002` alone are **weaker than production**: they inherit Supabase's default table grants, which reopen self-promotion to admin, purchase-status edits, anon writes, and `TRUNCATE` (not RLS-protected). `003_harden_grants.sql` closes that; it is idempotent and re-runnable.
- `004_fix_pending_limit_and_approval.sql` fixes two defects found by live E2E probing: the 3-pending cap counted `new.user_id` in a BEFORE INSERT trigger that fires before `prepare_purchase`, so omitting `user_id` bypassed it (now counts `auth.uid()`), and `admin_mark_purchase` was SECURITY INVOKER so `003`'s `UPDATE` revocation made approval fail (now SECURITY DEFINER with its own `is_admin` check). Do not "simplify" either back.
- `005_fix_handle_new_user_fallback_username.sql` fixes a third live defect: `handle_new_user` inserted `lower(trim(raw_user_meta_data ->> 'username'))` with no fallback, so creating a user from **Authentication → Users → Add user** (which sends no metadata) violated `profiles.username NOT NULL`, aborted the transaction, and returned `500` with `failed to close prepared statement … transaction is aborted`. The trigger now derives a sanitized, collision-suffixed username from the email local part (or the user id when that is too short). Do not put an unqualified metadata read back; `profiles.username` is `NOT NULL` and the trigger shares the auth insert's transaction, so any failure blocks user creation entirely.
- Production table grants after `003` (do not widen without a probe):
  - `anon`: `SELECT` on `plans`.
  - `authenticated`: `SELECT` on `plans`, `profiles`, `entitlements`, `summary_metadata`, `summary_contents`; `UPDATE (username)` on `profiles`; `SELECT, INSERT` on `purchase_requests`; `INSERT, UPDATE, DELETE` on `summary_metadata` and `summary_contents` (write is still admin-gated by RLS).
- Trigger functions (`handle_new_user`, `prepare_purchase`, `keep_paid_purchase_intact`, `grant_purchase_tools`, `limit_pending_purchases`) must not be RPC-callable; `003` revokes `EXECUTE` from `public`/`anon`/`authenticated`.
- `prepare_purchase()` is intentional: it forces `user_id = auth.uid()`, copies `amount` from `plans`, and sets `status = 'pending'`. A client sending `paid` or a fake price is being overwritten, not trusted.
- Admin promotion is SQL-only (`update public.profiles set role = 'admin' where email = ...`). There is deliberately no admin UI for it.
- `is_admin(uuid)` must stay executable by `authenticated` because RLS policies call it.
- The publishable key in `site/js/config.js` is meant to be public. Never put `service_role`, secret keys, DB passwords, or access tokens in `site/` or this repo.
- Probe RLS as a user inside a rolled-back transaction:
  ```sql
  begin;
  -- seed rows as owner
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
  -- assertion
  reset role; rollback;
  ```
  The SQL tool returns only the **last** statement, so run one assertion per call.

## Frontend rules (enforced by `tests/security.test.mjs`)

- No inline `<script>`/`<style>`/`style=`, no `on*=` attributes, no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`/`eval`/`new Function`, no `javascript:` URLs.
- Build dynamic nodes with `SY.el`/`textContent` + `append` from `site/js/util.js`.
- Any new external origin breaks CSP and the test allowlist. Update **both** `site/_headers` and the `allowed` set in `tests/security.test.mjs`.
- Gated pages start with `<html data-gate="pending">`; `auth.js` flips it to `open`/`blocked`, and CSS hides `.shell` until open. Every `/app/*` page must call `requireAccess({ tool })` or `requireAccess({ admin: true })` before rendering protected UI.
- Admin-only navigation links carry `data-admin-only` and default to `hidden`; `auth.js` reveals them only after `get_access` returns `role: 'admin'`. Hiding them is cosmetic, never the control.
- Money Tracker and Study Planner data stays in `localStorage` under `simpleyn.<tool>.v1.<user-uuid>`. Never sync it to Supabase.
- Google Fonts (Fraunces + DM Sans) is an intentional design choice. Do not replace it for generic "font best practice" reasons.

## Gotchas

- `.mt-row` in the Money Tracker sizes itself from a `@container mt-form` query, not a viewport `@media` block. A viewport rule collapsed `Keterangan` to `0px` between roughly `1121` and `1330px` (the chart column narrows the form before the window gets small) and its input overlapped `Nominal`; `tests/security.test.mjs` fails if a `@media` block lays out `.mt-row` again.

- MCP servers are not configured in this repo (no `opencode.json`). Supabase/GitHub tools come from the user's global OpenCode config; do not assume a project-local MCP setup.
- `tests/security.test.mjs` intentionally skips `site/js/vendor/` (pinned minified Supabase client) and root legacy HTML.
- HSTS is set in `site/_headers`, so the host must serve HTTPS for it to take effect.
- This is a git repo now; `main` is the deploy branch. Do not commit `.env`, tokens, or service-role keys (see `.gitignore`).
- `README.md` and `SECURITY.md` are Indonesian user-facing docs; update them when behavior or security assumptions change.
