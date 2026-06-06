# Star Paper Cloud-Only Documentation

## Overview

Star Paper is a cloud-first management app built for artist managers and teams. It combines bookings, money tracking, other income, artists, tasks, audience metrics, BBF tracking, PDF reports, and team collaboration inside one Supabase-backed application.

The app has been restructured from a mixed local/cloud model into a **cloud-only operational model**:

- Supabase Auth is the only source of truth for sessions.
- Supabase Postgres is the only source of truth for business data.
- Browser storage is limited to UI helpers and transport helpers, not business truth.

This document is the main reference for the current Star Paper architecture.

## Product Areas

Star Paper currently covers:

- dashboard and today board
- bookings and schedule management
- expenses
- other income
- artists
- tasks
- audience metrics
- reports and PDF exports
- BBF and closing-thought tracking
- profile/account management
- personal and team workspaces
- cloud sync across browsers and sessions

## Architecture Principles

### 1. Cloud-auth only

There is no supported local account mode in the current runtime.

- Sign-in, sign-out, refresh restore, and account updates depend on Supabase Auth.
- Email/password and Google sign-in are real auth flows.
- Email/password changes in Edit Profile are real auth changes, not local display changes.

### 2. Cloud-data only

Authenticated business data must be loaded from Supabase and saved back to Supabase.

This includes:

- bookings
- expenses
- other income
- artists
- tasks
- audience metrics
- revenue goals
- BBF entries
- closing thoughts
- profile state

### 3. Local storage is helper state only

The browser may still retain:

- theme and density
- last section and tab
- drafts
- boot context
- logout guard
- account-scoped retry queue
- currency preference
- sidebar state

Those keys help with UX but must not override cloud truth. `sp_retry_queue` is bounded transport state only: entries must be tagged with the Supabase user and workspace that created them, and they may replay only after the same Supabase user is restored.

## Main Runtime Files

### `app.js`

Owns:

- screen rendering
- navigation
- local UI state
- draft state
- report-period calculations
- BBF-aware report math
- profile UI updates
- post-boot page restore

### `supabase.js`

Owns:

- auth bootstrap
- session restore
- auth callback handling
- workspace resolution
- structured cloud saves
- profile/account persistence
- cloud refresh and sync orchestration
- account-scoped retry queue and sync indicator

### `app.reports.js`

Owns:

- report presentation
- PDF generation
- BBF-aware PDF summaries

### `app.tasks.js`

Owns:

- task rendering and task interactions

### `app.globe.js`

Owns:

- Schedule > Global three.js scene setup
- local-first land topology loading from `assets/world-atlas/land-50m.json`
- globe pins, route arcs, selected-booking sync, deselection, and reduced-motion behavior
- desktop right-side itinerary panel, mobile `peek` / `half` / `full` bottom sheet, compact itinerary rows, and booking detail sheet interactions
- UGX integer itinerary/detail money formatting and local-calendar booking date parsing

The land data lookup order is local asset, then built-in continent fallback. The local asset and the vendored `assets/vendor/` globe modules should stay in the service worker app shell list so the globe remains sharp when public CDN access is blocked. The globe module is presentation-only; it must not change Supabase booking queries, schema shape, or the underlying self-hosted Three.js scene/data pipeline.

Desktop Schedule > Global layout reserves separate rails for the left booking detail card and the right itinerary panel. The Three.js stage and globe toolbar belong in the center lane between those rails, so cards must not intrude into the globe's visual space. On mobile, the itinerary remains a bottom sheet and its scrollable body should use native vertical scrolling rather than trapping page scroll.

### `app.shell.js`

Owns:

- refined app-shell class toggles
- the `localStorage.sp_shell_refined_off` kill switch
- runtime polish classes for app-owned cards, primary actions, and in-app links

The shell relayer is additive and gated by `html.sp-shell-refined`. It must also respect `sp_prem_off` and `sp_handcraft_off`, because those switches are intended to disable premium/handcrafted visual relayering across the app shell.

### `app.boot-head.js`, `app.boot-flags.js`, and `app.boot-body.js`

Own:

- canonical legacy-host redirect cleanup
- public landing route isolation before the app shell renders
- prepaint premium/handcraft/shell kill-switch classes
- initial body theme classes
- auth-callback and app-route boot-loader forcing

These files replace the old inline boot scripts in `index.html`. They must remain versioned in `index.html` and precached in `sw.js`, and `script-src` must stay free of `'unsafe-inline'`.

### `app.public-pages.js`

Owns the public root HTML manifest: root file markers plus clean and `.html` landing route pairs. `app.boot-head.js`, `sw.js`, and `scripts/preflight.mjs` consume this file so the browser redirect guard, service-worker landing map, `.netlifyignore` unignore set, `_redirects`, and service-worker app shell stay synchronized.

### `public-page-head.js` and `public-page-theme.js`

Own the intentionally public landing-page boot path:

- app-route hash stripping on public landing URLs
- public section hash stripping, including stale links such as `#landing-features`
- manual scroll restoration plus top resets for `window`, `documentElement`, `body`, and `#landingScreen`
- prepaint premium/handcraft kill-switch class setup
- initial body theme class setup
- landing theme-toggle binding

These files replace the old inline scripts in `how-it-works.html`, `proof.html`, and `testimonials.html`. Public landing pages must not contain inline script blocks, inline style blocks, or inline style attributes, and their document CSP must not allow `'unsafe-inline'`. Keep `frame-ancestors 'none'` in `_headers`, not the HTML meta CSP, because browsers ignore `frame-ancestors` when it is delivered through a meta tag.

Landing roots use `landing-snap-page`; standalone public pages also use `landing-public-page`. In snap mode, `#landingScreen` is the scroll owner. The hero is the only forced one-screen composition; walkthrough, proof, testimonial, carousel, final-CTA, and footer content share the `--landing-max-width` rail plus section gutter/spacing variables so snapping stays smooth without clipped empty `100dvh` content slabs. Home links to How It Works must target `how-it-works.html` without `#landing-features` so `public-page-head.js` can keep direct and clicked navigation at the top hero.

### `app.root-shell.js`

Owns:

- deferred Sentry, Chart.js, jsPDF, globe, premium, and shell module loading
- the local-development cold-start guard
- the `file://` local-file warning
- the capture-phase root-shell `data-action` bridge
- forgot-password UI wiring

This file must load before `supabase.js` and `app.js` as a deferred root-shell asset. It keeps late executable runtime code out of `index.html`; `index.html` must not contain inline script blocks or an import map.

### `schema.sql`

Defines:

- tables
- constraints
- RLS policies
- RPCs
- indexes

The live project must match the runtime contract in `schema.sql`, not just the initial `CREATE TABLE` blocks. Required contract surfaces include the bootstrap RPC (`get_bootstrap_payload`), profile/team RPC helpers, `profiles.last_active_team_id`, `team_members.permissions`, business-table `team_id`/`legacy_id` scope columns, and scope-aware legacy-ID uniqueness for personal versus team rows.

### `sw.js`

Owns:

- service worker shell caching
- cache versioning
- freshness behavior for deployed assets
- network-first public landing navigation that fetches the requested URL before falling back to the manifest shell, normalizes fallback paths, hands clean same-origin redirects to the browser, and leaves direct `.html` public landing requests on the browser/network path

## Boot and Auth Flow

Star Paper supports three startup contexts:

- cold signed-out visit
- auth callback return
- authenticated app refresh

### Cold signed-out visit

Expected behavior:

- show the landing page first
- do not trap the user behind a full-screen loader
- allow the user to choose sign-in normally

### Signed-out app-route refresh

Expected behavior:

- a URL such as `/#settings` or `/#dashboard` without a stored Supabase session shows the login screen
- Supabase-owned `login`, `signup`, and Google handlers are patched only after the app boot helpers are ready, so `app.js` cannot overwrite them with fallback stubs
- the app must not leave the user on `Session restore stalled` or an app-refresh loader when no session exists

### Auth callback return

Expected behavior:

- show the boot loader while the auth callback is processed
- exchange or restore the Supabase session
- if the callback flow ID is superseded while a session is being recovered, rebase the auth boot flow and continue bootstrap; do not return `stale` with stored-session bootstrap disabled
- resolve workspace
- load cloud data
- enter the app shell

### Authenticated app refresh

Expected behavior:

- show a short boot/session loader
- restore the Supabase session
- rehydrate cloud data
- restore the last in-app section/tab
- return directly to the app shell
- clear any boot overlay once the app shell is visibly painted, even if an older boot flow id has been superseded
- do not treat an observed `INITIAL_SESSION`/auth event as handled until a bootstrap task actually starts; stale auth-event boot flows must rebase and continue instead of silently abandoning session restore

### Sign-out

Expected behavior:

- clear runtime session state
- set the logout guard
- remove authoritative local auth remnants
- remove exact and chunked Supabase auth storage keys from both `localStorage` and `sessionStorage`
- return to login or landing as designed
- clear `sp-force-boot` after the landing screen is active so the public screen is not hidden behind the signing-out overlay
- treat `sp_logged_out = '1'` as stronger than app-route hashes such as `#dashboard` or `#settings`; refresh after logout must stay public until the user signs in again

## Workspace Model

Star Paper supports:

- personal workspace
- team workspace

Workspace resolution uses:

- current authenticated user
- runtime active team state
- `profiles.last_active_team_id`
- team membership

If no valid team is selected, the app should default to personal workspace instead of blocking boot.

## Data Flow

### Read path

For an authenticated session:

1. Restore session through Supabase.
2. Resolve workspace.
3. Load cloud data through `get_bootstrap_payload`; if that RPC has no usable first-paint payload, fall back to direct table loads before declaring cloud data unavailable.
4. Sync that snapshot into the UI runtime.
5. Render the app.

### Write path

Core CRUD is saved per domain rather than through one giant bulk save:

- bookings
- expenses
- other income
- artists when needed

This reduces false failures where one unrelated save step makes the entire UI look unsynced.

### Refresh path

On refresh, Star Paper should:

1. keep the user authenticated if the session is valid
2. fetch the latest cloud snapshot
3. restore the last section/tab
4. avoid bouncing to landing or login unless the session is truly gone

After boot, data freshness is event-driven. Full cloud refreshes run after Supabase realtime table changes, same-account tab broadcasts, reconnect, focus, and visibility resume. The runtime must not keep the Android or browser client polling bookings, expenses, other income, artists, audience metrics, tasks, revenue goals, BBF entries, and closing thoughts every 10 seconds.

## Sync Model

Star Paper is designed for:

- same-account persistence after refresh
- same-account persistence after sign-out/sign-in
- same-account visibility across different browsers
- same-account visibility across different devices

Sync depends on:

- successful cloud writes
- valid RLS and schema in the live Supabase project
- bootstrap/workspace reload, focus/visibility resume, online recovery, cross-tab broadcast, and Supabase realtime refresh behavior

### Success definition

A save is successful only when the relevant cloud write succeeds.

### Failure definition

A failed cloud write is a failed save. It must not be treated as durable browser truth.

### Structured save results

The sync layer can return:

- `ok`
- `failedStep`
- `message`
- `context`

This helps isolate real failures such as:

- no session
- unresolved workspace
- schema mismatch
- RLS rejection
- network or timeout issues

## Reports and BBF

Star Paper's report calculations now distinguish between period performance and carried-forward balance.

### Definitions

- `periodNetProfit = income + other income - expenses`
- `bbf` = opening balance brought forward
- `closingBalance = bbf + periodNetProfit`

### Important rule

BBF affects the **closing balance**, not the period profit.

### PDF rule

PDF exports should:

- display BBF clearly as opening balance
- keep period profit period-only
- show the final closing balance using BBF in the formula
- keep both PDF generation paths aligned to the same shared totals

## Profile and Account Persistence

Edit Profile is now cloud-backed.

Supported persisted fields:

- username
- avatar
- phone
- bio
- email mirror in `profiles`

Auth-sensitive updates:

- email change goes through Supabase Auth
- password change goes through Supabase Auth

Expected behavior:

- profile changes re-render immediately
- avatar survives refresh
- avatar survives re-login
- profile updates appear in another browser on the same account after rehydrate

## Browser Storage Policy

### Allowed local helper state

- `sp_boot_context`
- `sp_logged_out`
- `sp_retry_queue` (account-scoped retry transport)
- `sp_currency`
- `sp_density`
- `sp_sidebar_collapsed`
- `starPaperTheme`
- `starPaperLastSection`
- `starPaperLastMoneyTab`
- `starPaperLastScheduleTab`
- `starPaperDrafts`
- push subscription/device keys
- BBF view state helper keys

### Disallowed as runtime truth

The following old categories must not drive authenticated runtime truth:

- local users
- local credentials
- local manager data
- local expenses
- local bookings
- local other income
- local artists
- local tasks
- local audience metrics
- local revenue goals
- local BBF entries
- local closing-thought records

## Production Security Model

The browser app is public code. Treat everything shipped to Netlify as readable by an attacker, including the Supabase anon key in `supabase.js`. The live data boundary is Supabase Auth plus RLS, authenticated RPC grants, actor checks inside SECURITY DEFINER functions, and team role permissions.

Security invariants enforced in source and preflight:

- Team invite codes are high-entropy bearer tokens. `schema.sql` uses schema-qualified `extensions.gen_random_bytes(16)` inside `public.generate_team_invite_code()` to create 32-character hex codes, rotates malformed/legacy codes when applied, makes `join_team_by_code` reject malformed codes before lookup with the same generic failure used for unknown codes, and exposes invite codes only through owner/admin RPC context rather than direct `teams` table SELECT.
- Team role permissions are database-bound. `team_members.permissions` must match `public.team_role_permissions(role)` so direct Supabase updates cannot assign custom privilege JSON outside the role model.
- Anonymous RPC execution is allowlisted. Signup username availability is intentionally anonymous; sensitive team/profile/data RPCs must remain authenticated-only.
- Every public table created by `schema.sql` must have RLS enabled, RLS policies must explicitly target `TO authenticated`, and SECURITY DEFINER functions must set the fixed path `search_path = public, pg_temp`.
- Workspace scope is immutable after row creation for business data and team membership. Trigger guards reject updates that change `owner_id`, `user_id`, or `team_id`; copying personal data into a team must insert cloned rows rather than reassign existing rows.
- Browser-rendered images must go through safe source normalization. Upload inputs accept PNG, JPG, WebP, or GIF only; avatars are capped at 1 MB and receipt/proof images at 4 MB.
- Empty-state CTAs, receipt/proof buttons, nudge dismissals, task controls, report filters, globe actions, calendar date picks, root-shell controls, and team modal actions dispatch through data attributes or explicit event listeners instead of raw JavaScript strings. Booking map/calendar labels, dashboard activity/cash-flow timeline labels, artist dropdown options, command-palette labels/subtitles, and fallback icon text must be escaped before insertion into HTML; command-palette and nudge icon rendering must use validated Phosphor icon class tokens. Globe hover cards, itinerary rows, sheet cards, and detail panels, report focus text, Today Board alerts, handcraft arrow icons, toast titles/messages, and team chat messages must render through DOM nodes or `textContent`, team member mutations must validate UUID-shaped IDs, and legacy admin user rows must escape local identity fields before rendering. Root boot/runtime logic lives in `app.boot-*.js`, `public-page-*.js`, and `app.root-shell.js`; preflight fails if script blocks drift back into inline public root HTML, if landing pages regain inline style allowances, if loose icon/raw palette HTML sinks return, if dashboard timeline or artist-option stored-data sinks return, if any `app.globe.js` `innerHTML`, handcraft icon `innerHTML`, report focus `innerHTML`, Today Board alert `innerHTML`, task/report/globe inline event handlers, or Supabase team chat `insertAdjacentHTML` return.
- Service worker navigation caching must treat OAuth/Supabase callback parameters as fetch-only. URLs containing `access_token`, `refresh_token`, `code`, `state`, token metadata, or auth error parameters must not be written to or read from Cache Storage under the sensitive request URL.
- The Supabase auth SDK is a same-origin runtime script at `assets/vendor/supabase/supabase.min.js`, pinned by `app.browser-assets.js` through `runtimeScript('supabase')`, loaded synchronously before `supabase.js`, and included in the service-worker app shell. Preflight must fail if auth boot drifts back to the floating Supabase CDN URL, if the vendored SDK is missing, if the SRI hash changes, or if the service worker stops precaching it.
- Supabase browser requests are bounded by the auth fetch timeout. If session restore or a user-triggered login/signup request cannot reach the live project, the app must recover to a visible login/cloud-unavailable state and must not leave `Session restore stalled` as the terminal screen.
- OAuth callback session recovery is bounded by the same boot contract: a recovered session must rebase stale boot flow IDs and enter `bootstrapFromSupabaseSession()` directly, even if Supabase's passive `SIGNED_IN` event is delayed.
- Classic CDN script resources that remain out of the auth boot path are pinned with SRI where browser-supported. `app.browser-assets.js` owns those CDN URLs/hashes plus local browser asset versions and vendored runtime file hashes. Brand fonts, Phosphor icon CSS/fonts, and the Schedule > Global Three.js, OrbitControls, and TopoJSON client modules are self-hosted under `assets/vendor/`; CSP and preflight must reject public-CDN regressions, version drift, or vendored hash drift for those runtime paths. `script-src` and `style-src-elem` must not include `'unsafe-inline'`; root and public landing document CSPs use `style-src-attr 'none'`. The remaining security work is the audited `app.js` `innerHTML` surface and any future dynamic style-attribute emitters, not a required CDN/font exception.

Security review artifacts:

- `star-paper-main-threat-model.md`
- `security_best_practices_report.md`

Those Markdown files are intentionally ignored from Netlify deploy packaging.

## Deployment and Caching

Star Paper uses a service worker, so deploy hygiene matters.

### Public root HTML contract

Netlify publishes the repository root. Root HTML is therefore deny-by-default in `.netlifyignore`, and preflight fails if any root HTML file exists outside this intentional public set:

- `index.html`
- `how-it-works.html`
- `proof.html`
- `testimonials.html`

Each public root HTML file must carry `<meta name="star-paper:public-root" ...>`. Use `content="app-shell"` for `index.html` and `content="public-landing"` for the public landing pages. Any new public landing page must be added to `app.public-pages.js`, the `.netlifyignore` unignore rules, the service-worker app shell, and `_redirects` if it needs an extensionless URL; preflight fails if those surfaces drift. Public landing pages must stay on the external `public-page-head.js`, `public-page-theme.js`, and `app.handcraft.js` boot path and must not reintroduce inline script/style blocks, inline style attributes, or CSP `unsafe-inline`.

Public landing scroll is owned by `#landingScreen.landing-snap-page`, not by `window`. Standalone public pages also carry `landing-public-page`. `public-page-head.js` sets `history.scrollRestoration = 'manual'`, strips known public section hashes, and resets both the document and `#landingScreen` to the top on early boot, `DOMContentLoaded`, `pageshow`, and `load`. `styles.handcraft.css` owns the landing rhythm variables, centered footer rail, compact final CTA, and carousel overflow containment; update its version in `app.browser-assets.js` and the public HTML query strings whenever those rules change. If public boot code exposes temporary auth helpers, `app.js` must replace them during initialization so the real Sign in and Get Started handlers reveal `#loginScreen`. Standalone public signup CTAs must target `./?auth=signup`, not `index.html?auth=signup`, because the static preview can canonicalize `index.html` to `/` and drop the query.

Do not keep private briefs, ad hoc documents, tests, local agent config, schemas, package metadata, or scripts in the deployable surface. Deleted files disappear from the live production URL after the next successful atomic deploy, but old Netlify deploy permalinks may retain prior deploy contents until those deploys are deleted or expire.

### Deploy together

When shipping auth, sync, reports, or boot changes, deploy matching versions of:

- `app.js`
- `supabase.js`
- `app.reports.js`
- `app.tasks.js`
- `app.globe.js`
- `app.shell.js`
- `app.handcraft.js`
- `app.boot-head.js`
- `app.boot-flags.js`
- `app.boot-body.js`
- `public-page-head.js`
- `app.root-shell.js`
- `styles.css`
- `styles.shell.css`
- `styles.handcraft.css`
- `index.html`
- `app.public-pages.js`
- `app.browser-assets.js`
- `sw.js`
- `assets/world-atlas/land-50m.json`
- `assets/vendor/` runtime assets, including the same-origin Supabase auth SDK

### Cache rule

If browser asset versions, same-origin runtime scripts, public landing boot scripts, vendored hashes, or pinned CDN hashes change, update `app.browser-assets.js` first. The service worker cache list, runtime loaders, static HTML, public landing HTML files, Supabase auth boot path, and vendor CSS references must match that contract or preflight fails.

This prevents stale boot or auth code from surviving a deploy.

## Pre-Release Manual Test Checklist

### Auth

- landing appears first for signed-out visitors
- Google sign-in enters the app shell
- sign-out returns cleanly
- refresh while signed in keeps the user in the app

### Persistence

- create booking, expense, and other income records
- refresh and confirm records persist
- sign out and sign back in and confirm records persist

### Cross-browser sync

- open the same account in another browser
- confirm new records appear after normal refresh or sync

### Profile

- update avatar, username, phone, and bio
- refresh and re-login
- confirm the new profile state remains

### Reports

- generate a PDF with non-zero BBF
- confirm BBF appears as opening balance
- confirm closing balance uses BBF

## Troubleshooting

### Boot loader never finishes

Investigate:

- refresh bootstrap flow
- auth callback handling
- in-flight bootstrap races
- workspace resolution
- live Supabase latency
- stale service worker shell

### User can sign in but data is missing after refresh

Investigate:

- cloud save result details
- Supabase schema alignment
- RLS
- whether the record was actually written to the live project

### Google sign-in returns to landing before app shell

Investigate:

- boot context markers
- callback handling
- service worker freshness
- auth redirect configuration

### Profile changes do not stick

Investigate:

- `saveAccountProfile()` result
- Supabase Auth update behavior
- `profiles` row update success
- avatar persistence and rerender path

## Recommended Release Standard

Do not treat Star Paper as release-ready unless all four of these are true:

1. Sign-in and sign-out work reliably.
2. Refresh restore works reliably.
3. Data persists through refresh and re-login.
4. The same account sees the same data across browsers and sessions.
