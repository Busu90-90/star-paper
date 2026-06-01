# Star Paper Security Best Practices Report

## Executive summary

This pass focused on the production static app and Supabase boundary. The most serious issues were weak team invite-code entropy/disclosure and mutable workspace scope in source RLS paths. Those are now fixed in source, with a live Supabase migration gap still remaining. The frontend also had high-value XSS-adjacent hazards because a single browser XSS can read Supabase sessions stored for the SPA; targeted receipt/proof, map/calendar, team modal, avatar, empty-state, upload, and CDN integrity controls were added without changing the deploy model.

## High severity

### SBP-001: Weak team invite codes could expose team data

Impact: an authenticated attacker who guessed or obtained an old short code could join a team as a viewer and read team-scoped data allowed by RLS.

- Evidence: `schema.sql` previously generated `teams.invite_code` with an 8-character MD5 substring and `join_team_by_code` looked up that value directly. A later audit also found ordinary members could still receive or direct-select `teams.invite_code`.
- Fix applied: `schema.sql` now enables `pgcrypto` in the Supabase `extensions` schema, generates 32-hex invite codes with schema-qualified `extensions.gen_random_bytes(16)`, rotates malformed/legacy source rows when the migration is run, adds a check constraint, rejects non-32-hex join attempts, removes direct `teams.invite_code` SELECT from authenticated users, and returns invite codes only through owner/admin team context RPCs.
- Residual risk: this is source-side until the updated `schema.sql` is run in the live Supabase project and `scripts/supabase-post-apply-verification.sql` returns no invite-code blockers there.

### SBP-002: Browser XSS has high impact because the SPA holds Supabase sessions

Impact: any executable JavaScript in the app origin can access browser-readable Supabase session state and synced business data.

- Evidence: `supabase.js` uses the Supabase browser client with persisted sessions, and `app.js` contains legacy templated DOM rendering.
- Fix applied: `emptyState()` no longer injects raw JavaScript into `onclick`; receipt/proof buttons, nudge dismissals, task controls, report filters, globe actions, calendar date picks, root-shell controls, and team modal member/team actions dispatch through data attributes or explicit event listeners instead of interpolated inline JavaScript; app/team mutation paths validate UUID-shaped IDs where appropriate; performance-map pins, panels, legends, location lists, globe hover cards, globe itinerary/detail sheets, report focus text, Today Board alerts, and handcraft arrow icons now render through DOM nodes; booking map, calendar tooltip, dashboard activity, cash-flow timeline, and artist dropdown labels are escaped before HTML insertion; command-palette labels/subtitles are escaped and palette/nudge icons render only from validated Phosphor icon class tokens; legacy admin user rows now escape names/emails and dispatch through `data-admin-*` attributes; toast titles/messages and team chat messages now render through `textContent`; team and currency modals now render through DOM nodes instead of `innerHTML`; image sources are normalized before assignment; uploads are limited to PNG/JPG/WebP/GIF and size-bound. Root boot/runtime scripts and style blocks were moved from inline `index.html` blocks into external files, public landing boot/theme scripts moved into `public-page-*.js`, the inline import map was removed, Supabase team chat no longer appends HTML strings, service-worker navigation caching now bypasses Cache Storage for OAuth/Supabase callback URLs, `style-src-elem` no longer allows `'unsafe-inline'`, public landing document CSPs no longer allow inline script/style execution, and preflight now fails if inline scripts, landing inline styles, inline task/report/globe handlers, loose/raw palette icon sinks, raw command-palette subtitle sinks, raw dashboard timeline/artist-option sinks, any `app.globe.js` `innerHTML`, handcraft icon `innerHTML`, report focus `innerHTML`, Today Board alert `innerHTML`, auth callback cache writes, team/currency `innerHTML`, runtime style injection, or chat `insertAdjacentHTML` return.
- Residual risk: audited `innerHTML` remains in `app.js` render paths. Root and public landing CSP now block inline style attributes with `style-src-attr 'none'`; fully removing the remaining HTML sinks is a larger compatibility pass.

### SBP-003: Mutable workspace scope could let editors move shared data

Impact: a malicious team editor could craft a direct Supabase update that turns a team row into their personal row, moves it to another team, or rewrites owner/user columns, causing team data exfiltration or destructive removal.

- Evidence: several RLS update policies allowed existing personal/team rows in `USING` and allowed proposed personal/team rows in `WITH CHECK`; PostgreSQL evaluates those expressions separately, so scope changes need an explicit database guard.
- Fix applied: `schema.sql` now adds trigger guards that reject `owner_id`, `user_id`, or `team_id` changes on business tables and `team_members`. Profile and team update policies also have explicit actor-bound `WITH CHECK` clauses. `team_members.permissions` is normalized from the selected role and constrained to `public.team_role_permissions(role)` so direct Supabase updates cannot create role/permission combinations the UI never emits. The team-copy flow in `supabase.js` now inserts cloned rows instead of reusing existing row IDs.
- Residual risk: this is source-side until the updated `schema.sql` is run in the live Supabase project, `scripts/supabase-post-apply-verification.sql` returns no workspace or team-permission blockers there, and any helper-covered active-probe warnings are closed by `scripts/supabase-post-apply-canary-proof.sql`.

## Medium severity

### SBP-004: Third-party runtime assets need integrity controls

- Evidence: `index.html` loads the Supabase SDK from jsDelivr, and `app.root-shell.js` dynamically loads Sentry, Chart.js, and jsPDF from pinned CDN URLs.
- Fix applied: SRI and `crossorigin` were added for classic CDN script loads, `app.browser-assets.js` now centralizes the CDN URL/SRI pins and local browser asset versions, the dynamic deferred loader reads from that contract, and the Google Fonts, Phosphor icon CSS/fonts, Three.js, OrbitControls, TopoJSON client, and world-atlas runtime paths are self-hosted/local and preflight-gated.
- Residual risk: the remaining CDN execution path is Supabase SDK, Sentry, Chart.js, and jsPDF. Those are still first-party-privileged browser resources, so their pinned versions, SRI hashes, CSP allowlist entries, and preflight checks must move through `app.browser-assets.js` together.

### SBP-005: Service-role credential exposure must fail deploy

- Evidence: Netlify publishes the repo root, and a browser app must never ship service-role credentials.
- Fix applied: `scripts/preflight.mjs` now scans source files for service-role env assignments, sensitive Supabase env assignments, and JWT payloads with `role = service_role`, while allowing the public anon key.
- Residual risk: preflight cannot remove a secret from git history or already-published deploy permalinks.

### SBP-006: RLS and SECURITY DEFINER drift must be caught before deploy

- Evidence: `schema.sql` owns RLS policies and SECURITY DEFINER RPCs used by the browser client.
- Fix applied: preflight now asserts every public table created in `schema.sql` has RLS enabled, browser data-access policies target authenticated users, anonymous RPC grants are empty, and SECURITY DEFINER function blocks set the fixed path `search_path = public, pg_temp`. `schema.sql` also owns the residual `public.ai_context` table with an explicit browser-deny policy, revoked browser table grants, and a covering `user_id` index; `getmyteamids` is retained only as a non-executable legacy alias.
- Residual risk: repo-side checks do not prove the live Supabase project is already synchronized. The live proof must include the post-apply advisor-surface rows for `ai_context`, username-to-email lookup absence, and the `SECURITY DEFINER` allowlist.

## Low severity

### SBP-007: Debug logging and browser storage remain sensitive-by-impact

- Evidence: Supabase auth/session state is browser-accessible by SPA design, and debug logging can expose user identity metadata when enabled locally.
- Fix applied: no new debug paths were added; the threat model documents browser storage as non-authoritative and not a confidentiality boundary.
- Residual risk: strict token isolation would require a server-managed session architecture, which is out of scope for this static deploy pass.

## Verification expectations

- `node --check scripts/preflight.mjs`
- `npm run preflight`
- `npm test`
- Live follow-up: run the updated `schema.sql` in Supabase, then run `scripts/supabase-post-apply-verification.sql`. Treat any `severity = 'blocker'` row as a migration stop; the advisor-surface checks must show `advisor.ai_context.rls_explicit_policy`, `advisor.ai_context.browser_grants_revoked`, `advisor.security_definer_rpc_surface`, and `advisor.username_email_lookup_absent` as `pass`. Warning rows otherwise identify tables without sample rows for active mutation probes. Run `scripts/supabase-post-apply-canary-proof.sql` to close helper-covered `team_members` and workspace-trigger warnings with rollback-contained disposable rows, and require `canary.rollback_contained = pass` before signoff.
