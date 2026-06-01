# Star Paper

Star Paper is a cloud-first artist management app for bookings, expenses, other income, reports, BBF tracking, tasks, audience metrics, profile management, and team workspaces.

## Current Architecture

Star Paper now runs on a **cloud-only runtime**:

- **Supabase Auth** is the only source of truth for sign-in, sign-out, refresh restore, and account state.
- **Supabase Postgres** is the authoritative store for bookings, expenses, other income, artists, BBF, revenue goals, closing thoughts, tasks, and profile data.
- **Browser storage is non-authoritative** and is only used for UI helpers such as theme, density, drafts, account-scoped retry transport, boot context, and last-view restore.
- **Cross-browser and cross-session sync** is expected for the same account because the app always rehydrates from the cloud.

## Documentation

- [Star Paper Cloud-Only Documentation](./STAR_PAPER_DOCUMENTATION.md)
- [Cloud-Only Setup Guide](./SETUP.md)
- [Cloud-Only State Schema](./STATE_SCHEMA.md)

## Local Preview

Run the static frontend only:

- `npm run preview` serves the app at `http://localhost:8080`.
- `npm run preview:alt` serves the same app at `http://localhost:8081` when 8080 is occupied.

Do not start `backend/` for app development. Star Paper talks directly to Supabase Auth and Supabase Postgres, so local auth redirects must be configured against the frontend preview origin you use.

Do not open `index.html` through `file://`; Google OAuth and email-confirm redirects require an `http://localhost` or deployed `https://` origin. After explicit logout, `sp_logged_out` blocks stored-session bootstrap until a fresh OAuth callback or user-initiated login clears it.

## Core Files

- `app.js` - UI runtime, navigation, local UI state, report helpers, profile UI, drafts, and rendering.
- `supabase.js` - auth, cloud bootstrap, sync engine, workspace resolution, structured save flows, and account/profile persistence.
- `app.reports.js` - PDF/report generation and report presentation helpers.
- `app.tasks.js` - task rendering and task interactions.
- `app.globe.js` - Schedule Global globe rendering, land topology loading, tour pins/arcs, itinerary panel behavior, and booking-detail sheet wiring.
- `app.shell.js` - additive app-shell refinement bootstrap that gates landing-aligned shell polish behind `localStorage.sp_shell_refined_off`.
- `app.boot-head.js`, `app.boot-flags.js`, `app.boot-body.js` - externalized prepaint and route/auth boot guards required before the main app bundle.
- `app.public-pages.js` - source of truth for public root HTML markers and clean/`.html` landing route pairs consumed by boot, service-worker, and preflight checks.
- `app.browser-assets.js` - browser asset contract for local version query strings, service-worker precache URLs, same-origin runtime scripts, external CDN SRI pins, and vendored runtime file hashes.
- `app.root-shell.js` - externalized root-shell runtime guards, deferred library loader, critical action bridge, local-file warning, and forgot-password wiring.
- `schema.sql` - database schema, constraints, RLS policies, and RPCs for the live Supabase project.
- `sw.js` - network-first shell caching for safe deploy refreshes.
- `assets/world-atlas/land-50m.json` - local world-atlas land TopoJSON used before the globe falls back to built-in continents.
- `assets/vendor/` - self-hosted browser runtime assets for the Supabase auth SDK, brand fonts, Phosphor icon CSS/fonts, and the Schedule > Global Three.js, OrbitControls, and TopoJSON client modules.

## Supabase Runtime Contract

The cloud-only runtime expects the live Supabase project to match `schema.sql`, including the upgrade-safe `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` guards in that file. Boot, workspace resolution, retry replay, and team/profile flows depend on:

- RPCs: `get_bootstrap_payload`, `is_username_available`, `get_my_team_context`, `get_team_members_context`, `create_team_with_member`, `join_team_by_code`, `get_my_team_ids`, `has_team_permission`, and `team_role_permissions`.
- Workspace columns: `profiles.last_active_team_id`, every business table's `team_id`, and `team_members.permissions`.
- Residual AI context table: `public.ai_context` is service-role-only extension state, not a browser runtime table. `schema.sql` keeps RLS enabled, installs an explicit deny policy for `anon`/`authenticated`, revokes browser-role table privileges, and indexes `user_id` so the live advisor does not rely on zero-policy fail-closed behavior.
- Bootstrap payload keys: `profile`, `teams`, `workspace`, and `data.bookings`, `data.expenses`, `data.otherIncome`, `data.artists`, `data.audienceMetrics`, `data.tasks`, `data.revenueGoal`, `data.bbfEntries`, and `data.closingThoughts`.
- Cloud refresh contract: full snapshots load on bootstrap/workspace reload and on actual sync signals: Supabase realtime changes, same-account tab broadcasts, reconnect, focus, and visibility resume. The browser runtime must not poll the core business tables on a fixed 10-second foreground interval.
- Retry transport: `sp_retry_queue` is browser-local, account/workspace-scoped transport state. There is no Supabase retry-queue table.
- Legacy ID uniqueness: personal rows are unique on `legacy_id, owner_id` only when `team_id IS NULL`; team rows are unique on `legacy_id, team_id`.

### Live Supabase Migration Readiness

Before applying the latest `schema.sql` in a live Supabase project, run [`scripts/supabase-migration-readiness.sql`](./scripts/supabase-migration-readiness.sql) in the Supabase SQL Editor. It does not change persistent schema or data; it only creates a temporary findings table for the current SQL session.

Runbook:

1. Open the Supabase project SQL Editor.
2. Paste and run `scripts/supabase-migration-readiness.sql`.
3. Treat any `severity = 'blocker'` row as a migration stop. Resolve duplicate nonblank `profiles.username`, duplicate valid nonblank `teams.invite_code`, and duplicate `legacy_id` values inside the same personal or team workspace before continuing. `public.ai_context` rows are not a browser-runtime blocker; readiness warnings for its policy/grant/index posture mean `schema.sql` still needs to be applied and then verified.
4. Rerun the readiness SQL until it returns no blocker rows.
5. Apply the latest `schema.sql`, then run the readiness SQL once more to confirm no duplicate blocker remains.

### Post-Apply Supabase Verification

After `schema.sql` is applied, run [`scripts/supabase-post-apply-verification.sql`](./scripts/supabase-post-apply-verification.sql) in the same Supabase project. It creates only a temporary findings table and uses rollback-contained active probes to confirm the live invite-code, workspace-scope immutability, and team-permission invariants. Follow [`SUPABASE_POST_APPLY_VERIFICATION.md`](./SUPABASE_POST_APPLY_VERIFICATION.md) as the operator runbook.

Post-apply pass condition: the base result set has no `severity = 'blocker'` rows. `severity = 'warning'` usually means the schema catalog checks passed but production had no sample row for an active mutation probe, so treat it as a direct-update proof gap for the named table rather than as a runtime contract change. Run [`scripts/supabase-post-apply-canary-proof.sql`](./scripts/supabase-post-apply-canary-proof.sql) to close helper-covered `team_members` and workspace-trigger warnings with rollback-contained disposable rows instead of app-created sample data; final signoff requires that helper result set to have no blockers and `canary.rollback_contained = pass`.

The post-apply SQL also proves the live advisor-facing surface: `public.ai_context` has an explicit deny policy and no browser-role table grants, `public.get_email_for_username(text)` is absent, and the executable `SECURITY DEFINER` allowlist is limited to authenticated runtime RPCs/helpers: `create_team_with_member`, `get_bootstrap_payload`, `get_my_team_context`, `get_my_team_ids`, `get_team_members_context`, `has_team_permission`, `is_username_available`, and `join_team_by_code`. `getmyteamids` may remain in the catalog for compatibility, but it must not be executable by `anon` or `authenticated`.

## Production Security Contract

- The Supabase anon key in `supabase.js` is public browser configuration, not a secret. RLS policies, authenticated RPC grants, actor checks, and team permissions are the real data boundary.
- Browser data-access RLS policies in `schema.sql` are scoped with `TO authenticated`; anonymous table access is not part of the production contract. Explicit deny policies may name `anon` only to document a closed surface such as `public.ai_context`.
- Anonymous browser callers have no executable Star Paper RPCs. Username availability is authenticated-only for profile edits; signup no longer depends on a pre-auth username probe because `handle_new_user()` and `profiles_username_key` resolve duplicate requested usernames at account creation.
- Supabase service-role credentials, JWT secrets, database passwords, and access tokens must never be committed or shipped. `npm run preflight` scans source files for service-role env assignments, sensitive Supabase env assignments, and service-role JWT payloads.
- Team invite codes are bearer tokens. `schema.sql` now generates 32-character hex codes with `pgcrypto`, rotates malformed or legacy short codes when applied, makes `join_team_by_code` reject malformed codes before lookup with the same generic failure used for unknown codes, and keeps invite-code disclosure behind owner/admin RPC views instead of direct table SELECT.
- SECURITY DEFINER RPCs in `schema.sql` must keep a fixed `search_path = public, pg_temp`; preflight fails if a new definer function omits that bound path.
- Team role permissions are database-bound. `team_members.permissions` is normalized from `team_role_permissions(role)` and constrained to that preset, so direct browser/Supabase updates cannot create impossible privilege combinations outside the role model.
- Business rows are workspace-scoped once created. `schema.sql` blocks updates that change `owner_id`, `user_id`, or `team_id` on personal/team data tables so a crafted browser request cannot move team records into a personal workspace or another team.
- User-controlled images must pass the browser-side image guardrails in `app.js`: PNG, JPG, WebP, or GIF only; avatars are capped at 1 MB and receipts/proofs at 4 MB. Rendered image URLs are normalized to safe data, same-origin, or HTTPS sources.
- The Supabase auth SDK is a same-origin runtime script at `assets/vendor/supabase/supabase.min.js`, pinned in `app.browser-assets.js` through `runtimeScript('supabase')`, synchronously loaded before `supabase.js`, and precached by the service worker. Preflight fails if `index.html`, `supabase.js`, or `app.browser-assets.js` drifts back to the floating Supabase CDN URL or if the vendored SRI hash changes.
- Supabase browser requests use a bounded fetch wrapper so stale session restore, login, and signup attempts resolve to a visible login/cloud-unavailable state instead of leaving the app on a stalled boot overlay.
- Signed-out app-route refreshes such as `/#settings` must show the Supabase login screen with patched cloud auth handlers, not the app-refresh loader. Password-login errors must not show stale credential/cloud-data toasts after a real Supabase session has already started booting through the auth-state path.
- If `get_bootstrap_payload` does not return a usable first-paint payload, `supabase.js` falls back to direct cloud loads before declaring cloud data unavailable. This keeps empty/new accounts bootable while still surfacing real load failures through the boot recovery UI.
- Classic third-party CDN scripts that remain out of auth boot are pinned with SRI where browser-supported. `app.browser-assets.js` is the source of truth for those CDN URLs/hashes and for local version query strings. Brand fonts, Phosphor icon CSS/fonts, and the Schedule > Global Three.js, OrbitControls, and TopoJSON client modules are self-hosted under `assets/vendor/`; preflight fails if those runtime paths drift back to public CDNs or if vendored file hashes drift.
- Browser storage and Cache Storage are not confidentiality boundaries. The app reduces XSS risk with DOM-rendered performance-map pins/panels/legends, globe hover cards/itinerary/detail sheets, report focus text, Today Board alerts, handcraft arrow icons, team and currency modals, escaped booking map/calendar/dashboard timeline labels, escaped artist dropdown options, escaped command-palette labels/subtitles, validated Phosphor icon tokens, `textContent` toast and team-chat rendering, constrained action dispatch, delegated receipt/proof/nudge/task/report/globe/team modal/root-shell actions, UUID-validated team mutations, image validation, service-worker auth-callback cache bypasses, CSP, and preflight checks. Root app-shell and public-landing boot scripts are externalized, public landing pages carry a stricter document CSP with no inline script/style allowance, `script-src` does not allow `'unsafe-inline'`, `style-src-elem` is self-only, and `style-src-attr` is blocked with `'none'`; residual XSS work is primarily the remaining audited `innerHTML` render paths in `app.js`.

Security reports for this pass:

- [Production threat model](./star-paper-main-threat-model.md)
- [Security best-practices report](./security_best_practices_report.md)

## What "working" means now

The app is considered healthy when all of the following hold:

- A signed-out visit opens on the landing page.
- A signed-out refresh on an app hash such as `/#settings` opens a working Supabase login screen, never a terminal session-restore loader.
- Google or email sign-in goes straight into the app shell after boot.
- Refresh while signed in keeps the user in the app and restores the last section/tab.
- Saving data persists to Supabase and reappears after refresh, re-login, or opening the same account in another browser.
- Profile updates persist through Supabase and re-render after refresh.
- Reports use cloud-backed data and BBF contributes to closing balance, not period profit.
- The refined app shell is opt-in at runtime through the `sp-shell-refined` class and can be disabled with `localStorage.sp_shell_refined_off = '1'`; premium and handcraft kill switches also disable the shell relayer.
- Schedule > Global loads the local land atlas first, then the built-in continent fallback. The globe remains visible while the itinerary appears as a right-side glass panel on desktop and a three-snap bottom sheet on mobile (`peek`, `half`, `full`).
- Globe itinerary selection is bidirectional: itinerary rows focus visible pins, visible pin taps scroll/highlight the matching row, and the detail sheet opens from the row chevron, double-tap, or mobile swipe action.

## Deployment Rule

Netlify publishes the repository root, so root HTML is deny-by-default. Only these root HTML files may be public:

- `index.html` for `/` and `/index.html`
- `how-it-works.html` for `/how-it-works` and `/how-it-works.html`
- `proof.html` for `/proof` and `/proof.html`
- `testimonials.html` for `/testimonials` and `/testimonials.html`

Every public root HTML file must be listed in `app.public-pages.js`, unignored in `.netlifyignore`, and marked with `<meta name="star-paper:public-root" ...>`. `app.boot-head.js`, `sw.js`, and `scripts/preflight.mjs` consume that manifest; preflight fails if the manifest, `.netlifyignore`, `_redirects`, or service-worker app shell drift apart. Public landing pages must load `public-page-head.js` and `public-page-theme.js`; preflight rejects landing inline scripts, inline style blocks, inline style attributes, and landing CSP `unsafe-inline`.

Always deploy the matching versions of:

- `app.js`
- `supabase.js`
- `app.reports.js`
- `app.tasks.js`
- `app.globe.js`
- `app.shell.js`
- `app.boot-head.js`
- `app.boot-flags.js`
- `app.boot-body.js`
- `app.root-shell.js`
- `styles.css`
- `styles.shell.css`
- `index.html`
- `app.public-pages.js`
- `app.browser-assets.js`
- `sw.js`
- `assets/world-atlas/land-50m.json`
- `assets/vendor/` runtime assets, including the same-origin Supabase auth SDK
- `schema.sql` when the database contract changes

If a browser asset version, vendored runtime file, or pinned CDN URL/hash changes, update `app.browser-assets.js` first. `scripts/preflight.mjs` then fails until `index.html`, `sw.js`, the lazy loaders, Supabase auth runtime loader, and vendor CSS references match that contract.

Residual deploy risk: old Netlify deploy permalinks can still expose files that existed in previous successful deploys until those deploys are deleted or expire. The next production deploy removes deleted files from the live production URL because Netlify deploys atomically, but do not place private briefs, secrets, tests, or local agent config in the repo root.

Root Markdown reports and docs are ignored by `.netlifyignore`; they are for repo review, not public hosting.
