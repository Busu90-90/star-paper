# CLAUDE.md — Star Paper Project Intelligence File

**READ THIS ENTIRE FILE BEFORE TOUCHING ANY CODE.**

This is the authoritative reference for the Star Paper codebase — architecture, constraints, workflows, and AI-assisted development patterns. It incorporates principles from the everything-claude-code (ECC) framework, adapted for Star Paper's vanilla JS + Supabase stack.

---

# TIER 1: STOP-AND-READ

---

## 1. Project Identity

**Star Paper** is a PWA for music managers across East and West Africa — bookings, expenses, income, artist rosters, financial reporting, and team collaboration in one cloud-first, mobile-first interface.

| Key | Value |
|-----|-------|
| **Live URL** | `https://star-paper.netlify.app` |
| **GitHub** | `https://github.com/Busu90-90/star-paper` (branch: `main`) |
| **Supabase Project Ref** | `fxcyocdwvjiyatqnaahg` — note the **v** at position 10 |
| **Supabase URL** | `https://fxcyocdwvjiyatqnaahg.supabase.co` |
| **Netlify Site ID** | `6f4ce419-55ca-472c-a6f8-06c3fea81970` |
| **Sentry** | `https://star-paper.sentry.io` / region: `https://de.sentry.io` |
| **Sentry DSN** | `https://43eaad14b9ae20eec68d9249f139cbc2@o4511079351189504.ingest.de.sentry.io/4511081427894352` |
| **Deploy Method** | GitHub commit to `main` → Netlify auto-deploys (**DO NOT** use manual drag) |
| **Base Currency** | UGX integers. Never floats. Never `parseFloat` for arithmetic. |

---

## 2. Deployment Process

### Primary: GitHub Auto-Deploy

Commit to `main` → Netlify auto-deploys in ~30 seconds. This is the only sanctioned deployment method.

### Emergency Fallback: Manual Drag-and-Drop

If auto-deploy fails, drag the **entire project folder** (not individual files) to `netlify.com/drop`. Individual file uploads create broken deployments where missing files (styles.css, manifest.json, logos) cause 404s masked by the Service Worker cache.

### Post-Deploy Verification (Required After Every Deploy)

1. Open the live URL in an **incognito window** to bypass SW cache
2. DevTools → Application → Service Workers → **Unregister** the old worker
3. Hard-refresh with **Ctrl+Shift+R**
4. Run this verification in the console:

```javascript
// Confirm correct supabase.js is loaded — must show 'fxcyocdwvjiyatqnaahg' with the 'v'
fetch('/supabase.js').then(r => r.text()).then(t => console.log(t.substring(150, 350)))

// Confirm the correct project ref from the JWT (ground truth)
JSON.parse(atob('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4Y3lvY2R3dmppeWF0cW5hYWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Nzg4NDEsImV4cCI6MjA4ODU1NDg0MX0.OTtDpyfA69rbVOTJkBh51pwj3wEkR1L04x4ouDkeWZ0'.split('.')[1]))

// Test cloud DB connectivity
window.SP?.client?.from('profiles').select('id').limit(1).then(r => console.log(r))

// Confirm app.js version
document.querySelector('script[src*="app.js"]')?.src
```

### Version Bumping Protocol

When editing JS files:
1. Increment `?v=N` query strings on edited scripts in `index.html`
2. Bump `CACHE_NAME` in `sw.js` (e.g., `star-paper-shell-v28`)
3. CSS-only changes do not require a SW cache bump (Stale-While-Revalidate handles it)

### Historical Note: Resolved Bugs

Four critical bugs were diagnosed and fixed in previous sessions: (1) auto-login after logout — resolved with `sp_logged_out` persistent flag and explicit SDK token clearing; (2) cloud data timeout — resolved by correcting a single-character URL typo in `supabase.js`; (3) team panel timeout — resolved by URL fix + `get_my_team_ids()` SECURITY DEFINER function; (4) cross-browser sync — resolved as downstream of bug 2. All fixes are verified present in the current codebase.

A later refactor **removed the legacy dual-auth and dual-data-flow paths**. The app is now cloud-first: Supabase is the single source of truth for both identity and data. See Sections 6 and 7 for the current architecture.

---

## 3. Immutable Architectural Constraints

### Script Load Order

Scripts must load in this exact sequence. Changing the order causes silent, hard-to-diagnose failures.

```html
<!-- In <head>, synchronous — NO defer, NO async: -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

<!-- At bottom of <body>, in order: -->
<script src="supabase.js?vN"></script>
<script src="app.migrations.js?vN"></script>
<script src="app.actions.js?vN"></script>
<script src="app.todayboard.js?vN"></script>
<script src="app.tasks.js?vN"></script>
<script src="app.js?vN"></script>
```

**Why this order:**
- **Supabase SDK** in `<head>` without `defer` — guarantees `window.supabase` exists before any app scripts run. Deferred loading would cause `supabase.js` to execute before the SDK is available.
- **supabase.js first** — patches `window.login`, `window.signup`, `window.logout`, `window.saveUserData`. `app.js` uses `||=` assignment so whichever script sets these first wins. `supabase.js` must win.
- **app.migrations.js second** — runs the one-time legacy→cloud migration if local data from an older install is still present.
- **app.actions.js third** — sets `window.__starPaperActionsBound = true`. `app.js` checks this flag before registering its fallback dispatcher.
- **app.js last** — consumes all globals set by prior scripts.

**Never add `defer` or `async` to any custom scripts.**

### Other Immutable Rules

- **`window.SP` is the only cloud interface.** All Supabase interaction goes through the `SP.*` API exposed by `supabase.js`. Never call `db.from()` directly outside `supabase.js`.
- **Supabase is the single source of truth.** All business data (bookings, expenses, income, artists, tasks, goals, BBF, thoughts) reads from and writes to Supabase. localStorage is used only for user preferences, session guards, a retry queue for offline-durable writes, and a one-time legacy migration snapshot. Never treat localStorage as authoritative for business data.
- **Writes are cloud-first with a retry queue.** `saveUserData()` pushes through `syncCloudExtras()` to Supabase. If the network fails, the payload is persisted into `sp_retry_queue` and replayed on the next successful sync. No business data is written to localStorage directly.
- **Atomic RPCs — do not decompose.** `create_team_with_member()` and `join_team_by_code()` are single Supabase RPC calls. Splitting them into two sequential queries causes `AbortError: Lock broken by steal` from the Supabase SDK's Web Lock mechanism.
- **Hash-based routing.** Navigation uses `#bookings`, `#expenses`, etc. All routing goes through `showSection()`.
- **UGX integers only.** All money values are `Math.round(Number(value) || 0)`. Balance is always re-derived as `fee - deposit`. Currency conversion is display-only via `SP_formatCurrencyFull()`.

---

# TIER 2: ARCHITECTURE

---

## 4. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | Vanilla JS ES6+ | No React, No Vue, No bundler, No npm for frontend |
| **HTML** | HTML5 | ~1,665 lines in `index.html`. Zero logic. |
| **Styling** | Custom CSS3 | ~7,000 lines in `styles.css` + `styles.premium.css` polish layer. Glassmorphism design. |
| **Icons** | Phosphor Icons v2.1.1 | CDN-loaded, duotone + regular + fill styles |
| **Charts** | Chart.js | CDN with `defer` |
| **PDF Reports** | jsPDF 2.5.1 + html2canvas 1.4.1 | CDN with `defer` |
| **Auth & DB** | Supabase JS SDK v2 | PostgreSQL + GoTrue Auth + Realtime. Single source of truth. |
| **Offline** | Service Worker | Stale-While-Revalidate caching, `star-paper-shell-vN` |
| **PWA** | `manifest.json` | Standalone display, portrait-primary, installable |
| **Backend** | Express 4.21.2 + TypeScript 5.7.2 | Minimal — health check + legacy/test auth endpoint |
| **Error Tracking** | Sentry | Region: `de.sentry.io` |

**Explicit negations:** No React, No Vue, No Angular, No bundler (Webpack/Vite/Rollup), No npm/node on frontend, No TypeScript on frontend, No CSS preprocessor, No build step for frontend.

---

## 5. File Structure and Responsibilities

Each file has a single non-negotiable responsibility. Never mix concerns across files.

```
index.html           — App shell. All HTML (~1,665 lines). Zero logic.
styles.css           — Core CSS (~7,000 lines). Single file. No imports.
styles.premium.css   — Additive premium polish layer (glass depth, radials, reveals). sp-prem-* prefixed.
supabase.js          — Cloud layer ONLY. Auth, DB sync, teams, currency, retry queue.
app.migrations.js    — One-time legacy→cloud migration. Runs once per user on boot.
app.actions.js       — Declarative action dispatcher for data-action clicks.
app.todayboard.js    — Today Board widget, alert calculation and rendering.
app.tasks.js         — Task board module, scoped per user, cloud-synced.
app.js               — Core engine. 300+ functions. All business logic.
app.premium.js       — Additive premium polish (radial ring, sparklines, parallax, etc.). SP_PREMIUM namespace.
sw.js                — Service Worker. Cache management. Offline fallback.
manifest.json        — PWA manifest. Icons and shortcuts.
schema.sql           — Supabase schema. Idempotent. Run in SQL Editor.
```

**Backend files:**
```
backend/src/server.ts  — Express app (port 3000). Health endpoint + legacy/test auth.
backend/src/auth.ts    — Legacy local authentication (kept only for the test-mode endpoint).
backend/src/types.ts   — TypeScript type definitions.
```

**Documentation:**
```
CLAUDE.md              — This file. Authoritative project reference.
SETUP.md               — Supabase setup walkthrough.
STATE_SCHEMA.md        — localStorage & data structure definitions.
SYSTEM_PROMPT.txt      — AI/LLM context codex.
tasks/todo.md          — Redesign implementation plan.
tasks/lessons.md       — Lessons learned from previous sessions.
```

Satellite modules (`app.migrations.js`, `app.actions.js`, `app.todayboard.js`, `app.tasks.js`, `app.premium.js`) communicate with `app.js` exclusively through `window.*` globals. They must never import or require each other.

---

## 6. Cloud-First Authentication

Star Paper has a **single** authentication system: Supabase Auth. The legacy local-session auth path has been removed.

**The canonical flow:**
1. Page loads. `supabase.js` IIFE runs, creates the Supabase client, sets `window.__spSupabaseReady = true`, and dispatches the `sp-supabase-ready` event.
2. `bootstrapFromSupabaseSession()` calls `supabase.auth.getSession()`. If a valid JWT is present and `sp_logged_out !== '1'`, it proceeds to `loadAllData()`, populates `window._SP_cloudData`, then triggers `loadUserData()` in `app.js` which hydrates the in-memory arrays and calls `showApp()`.
3. If no session is present (or `sp_logged_out === '1'`), the landing / login screen is shown. There is no local-session fallback and no offline-only boot path.
4. `supabase.auth.onAuthStateChange` handles OAuth redirects and token refreshes. It refuses to bootstrap when the logout flag is set.

**`checkAuth()` is now a stub.** It no longer reads `starPaper_session` or `starPaperSessionUser`. It only gates the boot loader state while the cloud bootstrap is in flight. `restoreSession()` is an empty no-op retained for legacy call-sites.

**Guards that are still authoritative:**
- `window.__spAppBooted` prevents double-rendering — once `true`, subsequent `showApp()` calls are no-ops. Reset to `false` during logout.
- `window.__spSupabaseReady` is set at the end of the `supabase.js` IIFE. The `sp-supabase-ready` event fires simultaneously. Never call `window.SP.*` before this flag is set.
- `sp_logged_out` localStorage flag prevents stale Supabase tokens from re-bootstrapping after explicit logout. Set synchronously in `signOut()`, cleared in `bootstrapFromSupabaseSession()` after confirming a real session.

**On logout**, `signOut()` clears the Supabase SDK token (`sb-fxcyocdwvjiyatqnaahg-auth-token`) and also sweeps any historical local-auth keys (`starPaper_session`, `starPaperSessionUser`, `starPaperCurrentUser`, `starPaperCredentials`, …) out of localStorage. Those keys are **only ever cleared, never read** — their presence has no effect on who is considered logged in.

---

## 7. Cloud-First Data Flow

There is one boot path and one save path. Both go through Supabase.

**Boot (read) path:**
```
bootstrapFromSupabaseSession()
  └─> loadAllData()              // fetches every table scoped to the active owner/team
       └─> window._SP_cloudData  // full snapshot payload
            └─> loadUserData()   // reads _SP_cloudData, populates in-memory arrays
                 └─> bookings, expenses, otherIncome, artists, tasks, goals, bbf, thoughts
                      └─> showApp() + render
```

`loadUserData()` in `app.js` does **not** read from localStorage for business data. If `_SP_cloudData` is missing, the app shows a retry state, not a stale local snapshot.

**Save (write) path:**
```
mutation in UI / action
  └─> updates in-memory array
       └─> saveUserData()
            └─> syncCloudExtras()     // upsert via window.SP.*
                 ├─> success          → patchIds() back-fills Supabase UUIDs into live arrays
                 └─> failure          → enqueue payload into sp_retry_queue
                                        (replayed on next successful sync or online event)
```

No business data is ever persisted to localStorage. Cloud failure is absorbed by the retry queue, not by a local write-through cache.

**ID strategy:** New client-side records are created with `Date.now()` as the local `id`. Cloud records use Supabase UUIDs. Every cloud table has a `legacy_id` column with a unique constraint `(legacy_id, owner_id)`. After every upsert, `patchIds()` in `supabase.js` back-fills the Supabase UUID into the live in-memory array so subsequent saves update existing rows instead of creating duplicates. Skipping `patchIds()` produces duplicate rows on every save cycle.

**Live re-injection:** `window._SP_syncFromCloud(data)` is the bridge. `supabase.js` calls it after team switches, realtime events, and delayed cloud responses to push fresh data into the running app, updating all arrays and triggering a re-render.

**Legacy migration:** `supabase.js` runs a one-time migration per user (keyed by `sp_migrated_{userId}`). It reads the old `starPaperManagerData`, `starPaperArtists`, `starPaperBBF`, etc. keys, pushes their contents into Supabase, and marks the user migrated. After that, the legacy keys are no longer read and can safely be deleted. They are preserved only so that users upgrading from a very old build do not lose data on first login.

---

## 8. Global State Variables

These live inside the `DOMContentLoaded` closure in `app.js` and are also exposed on `window`.

| Variable | Type | Description |
|----------|------|-------------|
| `currentUser` | string or null | Display username of logged-in manager (derived from Supabase profile) |
| `currentManagerId` | string or null | Supabase user UUID (prefixed `mgr_` in legacy code paths; treat as opaque) |
| `currentTeamRole` | string or null | `owner`, `manager`, `viewer`, or null |
| `bookings` | Array | In-memory booking records for current scope |
| `expenses` | Array | In-memory expense records for current scope |
| `otherIncome` | Array | In-memory other income records for current scope |
| `artists` | Array | All artists for current scope |
| `managerData` | Object | In-memory mirror of `{ [scopeKey]: { bookings, expenses, otherIncome } }` derived from `_SP_cloudData` |
| `revenueGoals` | Object | `{ [scopeKey]: UGX integer }` (hydrated from cloud) |
| `bbfData` | Object | `{ [scopeKey_YYYY-MM]: UGX integer }` (hydrated from cloud) |
| `window._SP_cloudData` | Object | Full cloud snapshot payload. Authoritative source for `loadUserData()`. |
| `window.__spAppBooted` | boolean | True after `showApp()`. Guards double-render. Reset on logout. |
| `window.__spSupabaseReady` | boolean | True after `supabase.js` IIFE completes |
| `window.SP_PREMIUM` | Object | `{ version, isEnabled(), enable(), disable(), forceRefresh() }` — premium polish layer handle |

`getActiveDataScopeKey()` determines which data partition to read and work against in memory. Returns `team:{teamId}` if a team is active, otherwise `currentManagerId`. Always use this function — never hardcode a scope key.

---

## 9. Database Schema and RLS

`schema.sql` is fully idempotent and safe to re-run at any time in the Supabase SQL Editor.

**Tables (12):** `profiles`, `teams`, `team_members`, `artists`, `bookings`, `expenses`, `other_income`, `revenue_goals`, `bbf_entries`, `tasks`, `closing_thoughts`, `messages`.

**RLS:** Enabled on every table. Policies ensure users only see rows where `owner_id = auth.uid()` (solo mode) or `team_id` matches a team they belong to (team mode). RLS is never disabled.

**RPC Functions (3):**
- `get_my_team_ids(uid)` — SECURITY DEFINER. Returns team IDs for a user. Breaks the RLS recursion trap on `team_members`.
- `create_team_with_member(p_name, p_owner_id)` — Atomic team creation + member insertion.
- `join_team_by_code(p_invite_code, p_user_id)` — Atomic code validation + member insertion.

**Legacy ID Constraints (4):** `bookings_legacy_id_owner_id_key`, `expenses_legacy_id_owner_id_key`, `other_income_legacy_id_owner_id_key`, `artists_legacy_id_owner_id_key` — all on `(legacy_id, owner_id)`. If any are missing, every `saveUserData()` creates duplicate rows.

**Trigger:** `handle_new_user()` auto-creates a profile row on auth signup.

**Security:** All SECURITY DEFINER functions must have `search_path` hardened to `public`. The `team_members` table must never use `FOR ALL` policies (causes recursive evaluation).

---

# TIER 3: RULES AND STANDARDS

---

## 10. Coding Style

Adapted from the everything-claude-code framework for vanilla JS.

### File Size
Existing monolithic files (`app.js` ~9,400 lines, `styles.css` ~7,000 lines) are intentional — debuggability is prioritised over modularity at this stage. **New modules should target 200-400 lines, max 800.** When suggesting a refactor of existing files, present it as optional future work, never as a prerequisite for the current task.

### Immutability
Create new objects — never mutate existing ones. Use spread operators for object updates. Use `.map()`, `.filter()`, `.reduce()` instead of in-place array mutation.

### Functions
- Keep functions under 50 lines. Extract helpers for longer logic.
- No nesting deeper than 4 levels — use early returns.
- Use JSDoc comments for public functions (not TypeScript annotations on frontend).
- Expose functions with `window.fnName ||= fnName` in the window exposure block.

### Buttons and Actions
- Use `data-action="fnName"` plus inline `onclick="fnName()"` fallback on every critical button.
- The triple-layer dispatch: `app.actions.js` (primary) → `app.js` fallback → inline `onclick` (safety net) → `wireCriticalButtons()` capture-phase listener (highest priority).
- Never remove `onclick` attributes from existing buttons — they are the last line of defence.

### Financial Arithmetic
- UGX integers only: `Math.round(Number(value) || 0)`
- Test with: `0`, `500000000` (500M), and negative values
- Balance always re-derived as `fee - deposit` before save
- Currency conversion is display-only — never stored

### Error Handling
- Handle errors explicitly at every level
- Use Sentry `captureException` or `captureMessage` — no `console.log` in production
- Never silently swallow errors
- Cloud-write failures route through the retry queue, not through silent catches

---

## 11. Git Workflow

### Commit Message Format
```
<type>: <description>

<optional body>
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

### After Every Commit
1. Wait ~30s for Netlify auto-deploy
2. Run deploy health agent: "Check the Star Paper deploy health."
3. Run verification commands from Section 2

### Branch Strategy
- `main` for production (auto-deploys)
- Feature branches for development
- Merge to `main` only after verification

---

## 12. Testing Strategy

**Current state:** No automated tests. **Target:** 80% coverage.

### Bootstrap Path
Install Vitest (works with vanilla JS via happy-dom, no build step required):
```bash
npm init -y
npm install -D vitest happy-dom
```

### Test File Convention
`*.test.js` alongside source files, or a `__tests__/` directory.

### Priority Test Targets (in order)
1. **Financial calculations** — UGX arithmetic, fee/deposit/balance derivation, currency formatting
2. **Auth flow** — Supabase sign-in, sign-out, `sp_logged_out` guard, `onAuthStateChange` refusing to rebootstrap when logged out
3. **Data sync** — cloud-first upsert, `patchIds()` UUID back-fill / deduplication, retry queue durability across reloads
4. **Scope filtering** — `getActiveDataScopeKey()`, `applyScopeFilter()`, team vs solo mode

### TDD Workflow (Mandatory for New Features)
1. **RED** — Write a failing test first
2. **GREEN** — Write minimal implementation to pass
3. **REFACTOR** — Clean up without changing behaviour
4. Verify coverage meets 80%

### E2E Testing
Playwright for critical flows: login, add booking, switch team, generate report.

### Completion Gate
"Done" requires proof. No proof, no completion. (Lesson 9)

---

## 13. Security Checklist

### Pre-Commit Checks
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated before processing
- [ ] No `innerHTML` with user data (XSS prevention)
- [ ] No string concatenation in Supabase queries (use `.eq()`, `.match()`, etc.)
- [ ] Error messages do not leak sensitive data

### Supabase-Specific
- [ ] RLS enabled on ALL 12 tables
- [ ] No `FOR ALL` policies on `team_members` (recursion trap)
- [ ] All SECURITY DEFINER functions have `search_path` hardened to `public`
- [ ] All 4 `legacy_id` unique constraints exist
- [ ] Service role key **never** in frontend code, localStorage, or git
- [ ] Supabase anon key is safe to expose (RLS protects data)

### Financial Data Protection
- [ ] UGX integers only — `NUMERIC` type in Postgres, always whole numbers
- [ ] Balance re-derived as `fee - deposit` before save
- [ ] Currency conversion is display-only, never stored
- [ ] No business data written to localStorage (cloud-first only)

### Auth Security
- [ ] Supabase SDK token (`sb-fxcyocdwvjiyatqnaahg-auth-token`) explicitly cleared on logout
- [ ] `sp_logged_out` flag set synchronously before any async logout operations
- [ ] `onAuthStateChange` refuses to bootstrap when the logout flag is set
- [ ] Legacy local-auth keys are cleared on logout, never read for auth decisions
- [ ] `bootstrapFromSupabaseSession()` is the **only** path that hydrates an authenticated app state

### Security Response Protocol
If a security issue is found:
1. **STOP** immediately
2. Use **security-reviewer** agent
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets
5. Review codebase for similar issues

---

## 14. Performance Budget

| Metric | Target |
|--------|--------|
| Dashboard load (3G) | < 500ms after cloud snapshot arrives |
| Time to interactive | < 1s on low-end Android (from cached shell) |
| SW pre-cache | All APP_SHELL files |

- CDN libraries loaded with `defer` (Chart.js, jsPDF, html2canvas) **except** Supabase SDK (synchronous in `<head>`)
- Supabase calls use `withTimeout()` guard (8 seconds) to prevent indefinite hangs
- No lazy-loading of core modules — all scripts are < 10KB individually except `app.js`
- Minimize DOM queries in hot paths — cache element references
- Premium polish layer (`app.premium.js`) is additive and guarded by `SP_PREMIUM.isEnabled()`; kill-switch via `localStorage.sp_prem_off = '1'`

---

## 15. localStorage Key Registry

Every key used in the app. Never invent new keys without adding them to this table.

### Active keys (read and written by the running app)

| Key | Owner | Description |
|-----|-------|-------------|
| `sp_logged_out` | supabase.js | Logout lock flag. Value `"1"`. Prevents stale Supabase tokens from re-bootstrapping after explicit logout. |
| `sp_active_team` | supabase.js | Active team UUID or empty string |
| `sp_currency` | supabase.js | Active currency code, e.g. `"UGX"` |
| `sp_migrated_{userId}` | supabase.js | Per-user one-time cloud migration completion flag |
| `sp_retry_queue` | supabase.js | JSON array of pending cloud saves that survived browser close. Replayed on successful sync, cleared on logout. |
| `sp_last_save_toast` | supabase.js | Throttle timestamp for "Saved to cloud" toast (10s cooldown) |
| `sp_density` | app.js | `"comfortable"` or `"compact"` |
| `sp_sidebar_collapsed` | app.js | `"1"` if sidebar is collapsed on desktop |
| `sp_tasks` | app.tasks.js | Task board UI preferences (view mode, filters) — UI state only, not task data |
| `sp_prem_off` | app.premium.js | `"1"` disables the premium polish layer (kill-switch) |
| `starPaperTheme` | app.js | `"dark"` or `"light"` |
| `starPaperDrafts` | app.js | In-progress form drafts (bookings, expenses). UI-only, reconciled against cloud on save. |
| `starPaperBBFViewState` | app.js | BBF panel view preferences (collapsed months, sort) |
| `starPaperPushPublicKey` | app.js | Web Push VAPID public key cache |
| `starPaperPushEndpoint` | app.js | Web Push subscription endpoint |
| `starPaperPushSubscription` | app.js | Web Push subscription JSON |
| `starPaperApiBaseUrl` | app.js | Backend API base URL override (dev only) |
| `starPaperSchemaVersion` | app.migrations.js | Integer, currently `2`. Guards the legacy-data migration run. |
| `sb-fxcyocdwvjiyatqnaahg-auth-token` | Supabase SDK | SDK's own JWT storage. Explicitly cleared on logout. |

### Legacy / migration-only keys (read once during migration, never written by the running app)

These exist only so that users upgrading from an older build do not lose data on first login. After the per-user migration completes (`sp_migrated_{userId}` is set), these keys are no longer consulted and may be deleted. On logout they are swept out of localStorage for hygiene; none of them influence who is considered logged in.

| Key | Historical Owner | Description |
|-----|------------------|-------------|
| `starPaper_session` | legacy app.js | Old local session marker |
| `starPaperSessionUser` | legacy app.js | Old active-session username |
| `starPaperCurrentUser` | legacy app.js | Old "Remember Me" username |
| `starPaperRemember` | legacy app.js | Old Remember Me boolean |
| `starPaperCredentials` | legacy app.js | Old hashed credential map — never read by current code |
| `starPaperUsers` | legacy app.js | Old array of local manager profiles |
| `starPaperArtists` | legacy app.js | Old artists array (migrated to cloud) |
| `starPaperManagerData` | legacy app.js | Old `{ [scopeKey]: { bookings, expenses, otherIncome } }` (migrated) |
| `starPaperRevenueGoals` | legacy app.js | Old revenue goals (migrated) |
| `starPaperBBF` | legacy app.js | Old BBF balances (migrated) |
| `starPaperClosingThoughtsByPeriod` | legacy app.js | Old closing thoughts (migrated) |
| `starPaperAudienceMetrics` | legacy app.js | Old audience metrics (migrated) |

---

## 16. Adding New Features Checklist

Every new feature must satisfy this checklist before it is complete:

- [ ] **Data storage?** Write to Supabase via `window.SP.*` or `syncCloudExtras()`. On failure, the retry queue (`sp_retry_queue`) persists the payload for the next successful sync. Do not write business data to localStorage.
- [ ] **Money involved?** UGX integers only, `Math.round(Number(value) || 0)`, test with 0, 500M, and negative.
- [ ] **UI change?** Test at 375px viewport width in both dark and light themes, with premium layer on and off (`localStorage.sp_prem_off`).
- [ ] **New button?** Use `data-action="fnName"` plus inline `onclick="fnName()"` and `window.fnName ||= fnName`.
- [ ] **Supabase query?** Must go through `applyScopeFilter()` or `applyUserScopeFilter()` — never without scope.
- [ ] **New table?** Add to `schema.sql` with `CREATE TABLE IF NOT EXISTS` and RLS enabled. Add a `legacy_id` column + `(legacy_id, owner_id)` unique constraint if records are created client-side. Re-run schema.
- [ ] **New localStorage key?** It must be UI state, a preference, or a durability aid (retry queue / migration flag). Add it to the active keys table in Section 15. If it would hold business data, stop and put it in Supabase instead.
- [ ] **Test?** Write at minimum a unit test for the core logic.
- [ ] **Plan written?** Non-trivial tasks require a plan in `tasks/todo.md` before implementation. (Lesson 8)

---

# TIER 4: AGENTS, SKILLS, AND COMMANDS

---

## 17. Agent Delegation Table

Agents mapped to Star Paper use cases. Use these proactively — no user prompt needed.

| Agent | Star Paper Use Case | When to Trigger |
|-------|-------------------|-----------------|
| **planner** | New feature design (Phase 3-6 of redesign) | Complex features, multi-file changes |
| **architect** | Data flow changes, new Supabase tables, module extraction | Architectural decisions |
| **tdd-guide** | Writing first tests, adding test coverage | New features, bug fixes |
| **code-reviewer** | After modifying any `.js` file | After writing code, before commit |
| **security-reviewer** | Auth changes, RLS policy changes, financial code | Mandatory for auth/money/RLS |
| **database-reviewer** | `schema.sql` changes, RPC functions, RLS policies | Schema modifications |
| **build-error-resolver** | Backend TypeScript compilation issues | When `tsc` fails |
| **doc-updater** | CLAUDE.md, README.md, STATE_SCHEMA.md updates | After architecture changes |
| **refactor-cleaner** | Extracting modules from `app.js` | Code maintenance |
| **performance-optimizer** | Dashboard render time, Supabase query optimization | Performance regression |

**Agents NOT applicable** (vanilla JS project, no need for): rust-reviewer, go-reviewer, python-reviewer, kotlin-reviewer, java-reviewer, cpp-reviewer, flutter-reviewer, healthcare-reviewer, and all language-specific build resolvers except TypeScript (backend only).

### Multi-Perspective Analysis

For complex problems, launch parallel sub-agents:
- Factual reviewer (correctness)
- Security expert (vulnerabilities)
- Senior engineer (architecture)
- Consistency reviewer (patterns)

---

## 18. Autonomous Agent Triggers

Trigger phrases for Claude at the start of a session or after a change. Claude runs multiple tool calls automatically.

---

### Session Start Agent
**Say**: "Run the Star Paper session start check."

Claude autonomously:
1. Queries Supabase — verifies schema + counts rows in all 12 tables
2. Checks Netlify — confirms last deploy was a GitHub auto-deploy (not manual drag)
3. Checks Sentry — pulls any new errors from the last 24 hours
4. Produces a one-page status report: what's broken, what's healthy, what to fix first

Use this at the start of every dev session. Never start writing code before running this.

---

### Schema Guard Agent
**Say**: "Run the Star Paper schema guard."

Claude runs a full SQL audit against Supabase project `fxcyocdwvjiyatqnaahg` and checks:
- All 3 RPC functions exist (`get_my_team_ids`, `create_team_with_member`, `join_team_by_code`)
- `handle_new_user` trigger exists
- All 4 `legacy_id` constraints exist (bookings, expenses, other_income, artists)
- RLS is enabled on all 12 tables
- `search_path` is hardened on all SECURITY DEFINER functions
- `team_members` has no `FOR ALL` policy (recursion trap)

Use before and after any schema changes.

---

### Data Health Agent
**Say**: "Run the Star Paper data health check."

Claude queries row counts in all financial tables. Signature of a broken deploy or URL bug: profiles > 0, but bookings/expenses/other_income/artists/tasks all = 0. If that pattern appears, stop and fix the deployment before doing anything else.

Use when users report data not saving or syncing.

---

### Deploy Health Agent
**Say**: "Check the Star Paper deploy health."

Claude checks the latest Netlify deploy and reports:
- Was it a GitHub auto-deploy (good) or manual drag (bad)?
- How many files were deployed?
- What is the commit SHA and URL?
- Is the deploy state "ready"?

A healthy deploy: `commit_ref` is set, `manual_deploy` is false, multiple files changed.
A broken deploy: `manual_deploy` is true, "1 new file uploaded", `commit_ref` is null.

Use after every commit to confirm the deploy went through correctly.

---

### Sentry Triage Agent
**Say**: "Run the Star Paper Sentry triage."

Claude pulls the last 48 hours of errors from `de.sentry.io` (star-paper org), groups by type and frequency, and matches against known patterns. Reports new bugs, recurring errors, and previously silent failures.

Use weekly, or when a user reports unexpected behaviour.

---

### Security Audit Agent
**Say**: "Run the Star Paper security audit."

Claude runs both security and performance advisors against Supabase project `fxcyocdwvjiyatqnaahg`, then checks:
- `search_path` is set on all SECURITY DEFINER functions
- RLS is enabled on every table
- No tables have RLS enabled with zero policies (silent inaccessibility trap)
- Reports findings with severity and exact fix SQL

Use monthly or after any schema migration.

---

### Regression Check Agent
**Say**: "Run the Star Paper regression check." (after any fix)

Claude verifies the fix didn't break anything:
1. Schema guard — all functions/constraints/triggers still present
2. Deploy health — last deploy was GitHub auto-deploy with multiple files
3. Data health — financial tables not suddenly empty
4. Sentry — no new error spike in the last 30 minutes
5. Auth guard — `sp_logged_out` check still present in `supabase.js` `bootstrapFromSupabaseSession()` / `onAuthStateChange`, and `checkAuth()` in `app.js` is still a stub (does not read legacy local-auth keys)
6. Retry-queue guard — `sp_retry_queue` enqueue path still present in the `syncCloudExtras` failure branch

Use after every bug fix before closing the session.

---

### Quick Reference — Session Workflow

```
START OF SESSION:
  -> "Run the Star Paper session start check."
  -> Read the report. Fix anything flagged before writing new code.

AFTER WRITING A FIX:
  -> Commit to GitHub (Netlify auto-deploys in ~30s)
  -> "Check the Star Paper deploy health."
  -> "Run the Star Paper regression check."

WEEKLY:
  -> "Run the Star Paper Sentry triage."
  -> "Run the Star Paper security audit."

WHEN USERS REPORT DATA PROBLEMS:
  -> "Run the Star Paper data health check."
  -> If financial tables = 0, check deploy health first.
```

---

## 19. Skills Reference

Skills relevant to Star Paper development.

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `star-paper-dev` | Star Paper development specialist | Any star-paper work |
| `tdd` / `tdd-workflow` | Test-driven development workflow | Writing tests |
| `security-scan` / `security-review` | Security vulnerability scanning | Before deploy, after auth changes |
| `verify` / `verification-loop` | Post-change verification loop | After any fix |
| `plan` | Implementation planning | Multi-step features |
| `code-review` | Code quality review | Before every commit |
| `build-fix` | Resolve build errors | Backend TypeScript errors |
| `docs` / `update-docs` | Documentation updates | After architecture changes |
| `checkpoint` / `save-session` | Session state capture | End of session, long-running work |
| `resume-session` | Resume from saved state | Start of follow-up session |
| `deploy-checklist` | Pre-deploy verification | Before Netlify deploy |
| `database-migrations` | Schema change management | Supabase schema updates |
| `deep-research` | Comprehensive research | Before implementing unfamiliar patterns |
| `frontend-patterns` | Frontend best practices | UI component design |

---

## 20. Commands Quick Reference

| Command | Description |
|---------|-------------|
| `/plan` | Generate implementation plan for a feature |
| `/tdd` | Enter TDD workflow (RED-GREEN-REFACTOR) |
| `/verify` | Run verification loop post-change |
| `/code-review` | Trigger code review on current changes |
| `/security-scan` | Run security audit (OWASP Top 10) |
| `/build-fix` | Diagnose and fix build errors |
| `/docs` | Update documentation |
| `/save-session` | Persist session state for later resume |
| `/resume-session` | Resume from saved session state |
| `/checkpoint` | Create a progress checkpoint |
| `/refactor-clean` | Dead code cleanup and consolidation |
| `/deep-research` | Research before implementing new patterns |

---

## 21. Hook Configuration

Recommended hooks for Star Paper development.

### PreToolUse Hooks
- **block-no-verify**: Prevent skipping git hooks (`--no-verify`)
- **commit-quality**: Validate commit messages follow conventional format (`feat:`, `fix:`, etc.)

### PostToolUse Hooks
- After editing `.js` files: run `node --check <file>` for syntax verification
- After editing `.ts` files (backend): run `npx tsc --noEmit`
- After editing `.css`: warn if `!important` is used outside density override sections

### Stop Hooks
- Check all modified files for `console.log` statements
- Verify version strings were bumped if JS files were modified
- Run verification commands from Section 2

---

# TIER 5: REFERENCE

---

## 22. CSS Architecture

Styles split across two files: the core in `styles.css` (39 numbered sections) and an additive premium polish layer in `styles.premium.css` (all selectors `sp-prem-*`-prefixed to avoid collisions).

**Core Palette:**
| Token | Value | Usage |
|-------|-------|-------|
| `--gold-amber` | `#FFB300` | Primary accent |
| `--onyx-deep` | `#0B0B0B` | Background |
| `--text-primary` | `#FFFFFF` | Body text |

**Themes:** Dark (default) / Light via `body.light-theme`
**Density:** Comfortable (default) / Compact via `body.sp-density--compact`
**Breakpoints:** 360px (baseline), 480px, 768px, 1025px
**Design:** Glassmorphism — backdrop blur, low-alpha borders, layered transparency

**Rules:**
- Never use `!important` outside designated density override sections.
- Never edit existing selectors in `styles.css` from the premium layer — only add new `sp-prem-*` classes and keyframes.
- All premium animations must honour `prefers-reduced-motion`.

---

## 23. Lessons Learned

Full log in `tasks/lessons.md`. Top 5 for daily reference:

**Lesson 8: Plan-first discipline.** No non-trivial implementation begins before a checkable plan is written in `tasks/todo.md`. All 3+ step or architectural tasks are plan-gated.

**Lesson 9: Verification is a completion gate.** "Done" requires proof — tests, logs, or observable behaviour checks. No proof, no completion.

**Lesson 10: Continuous self-correction.** Every user correction creates or updates at least one concrete preventive rule in `tasks/lessons.md`.

**Lesson 12: PDF assets need non-fetch fallback.** For client-side PDF branding assets, never rely on a single network-style loader path. Always include an `Image` element decode fallback.

**Lesson 13: Cache-bust on production hotfixes.** If a UI bug appears "fixed in code but unchanged in app", treat cache versioning (`?v=N` + SW `CACHE_NAME`) as part of the fix, not a follow-up.

### Patterns to Apply
1. Visual hierarchy — one dominant element, supporting below
2. Usage-based navigation — frequent tasks get top-level access
3. Task-based grouping — group by user goal, not data type
4. Single source of truth — one entry point, multiple views
5. Proactive intelligence — surface insights, don't make users hunt

### Anti-Patterns to Avoid
1. Equal-weight cards with no hierarchy
2. Flat navigation treating all features equally
3. Fragmenting related data across sections
4. Separate sections for output formats
5. Dual data entry points
6. Purely reactive data display
7. **Dual persistence paths.** Writing business data to localStorage "just in case" re-introduces the drift that the cloud-first refactor removed. The retry queue is the sanctioned durability mechanism — don't reinvent it.

---

## 24. Roadmap and Local Development

### Current Redesign Status
See `tasks/todo.md` for full implementation plan.
- Phase 1 (Today Board): Complete
- Phase 2 (Task List): Complete
- Phase 3 (Smart Nudges): Pending
- Phase 4 (Money Section Merge): Pending
- Phase 5 (Calendar as Booking View): Pending
- Phase 6 (Streaks Widget): Pending
- Cloud-first migration: **Complete** (dual auth and dual data flow removed)
- Premium polish layer (`styles.premium.css` + `app.premium.js`): Complete, shipped behind `sp_prem_off` kill-switch

### Local Development

**Frontend dev server:**
```bash
npx serve . -l 5000
```

**Backend dev server (optional):**
```bash
cd backend && npm run dev
```

The backend is optional for frontend work — the app speaks directly to Supabase. The backend exists for the `/api/health` probe and the legacy local test-auth endpoint.

**Google OAuth** requires `http://` or `https://` — does not work on `file://`. Add `http://localhost:5000` to Supabase Redirect URLs under Authentication → URL Configuration.

**Offline / disconnected testing:** there is no local-session fallback. To exercise the offline-durability path, sign in normally against Supabase, then go offline in DevTools and make edits — they will accumulate in `sp_retry_queue` and flush on reconnect.

### Engineering Philosophy

This is a single-developer production SaaS with real users and real financial data. There is no staging environment. Test in incognito before communicating any fix to users.

The hardest part of this project is not the code — it is ensuring that fixed code actually reaches the browser. The service worker, Netlify's deployment model, and browser caching create a three-layer system where a "deployed" fix can be completely invisible to users. A fix not verified with the console commands in Section 2 is a fix that does not exist.
