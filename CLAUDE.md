# CLAUDE.md — Star Paper Project Intelligence File

**READ THIS ENTIRE FILE BEFORE TOUCHING ANY CODE.**

This is the authoritative reference for the Star Paper codebase. It was written after multiple failed fix attempts across multiple sessions. The failures were not caused by wrong diagnoses — they were caused by fixes never reaching production due to a deployment method that silently produced broken mixed deployments. Every bug documented here is still present in the live codebase as of the writing of this file. The root causes are confirmed, the fixes are known, but the fixes have not yet survived a correct full-folder deploy.

---

## 1. Project Identity

**Star Paper** is a PWA for music managers across East and West Africa — bookings, expenses, income, artist rosters, financial reporting, and team collaboration in one offline-capable, mobile-first interface.

- **Live URL:** `https://star-paper.netlify.app`
- **Hosting:** Netlify, manual drag-and-drop deploys only, no CI/CD
- **Backend:** Supabase (PostgreSQL + GoTrue Auth + Realtime)
- **Supabase Project Ref:** `fxcyocdwvjiyatqnaahg` — note the **v** at position 10
- **Correct Supabase URL:** `https://fxcyocdwvjiyatqnaahg.supabase.co`
- **Base Currency:** UGX integers. Never floats. Never `parseFloat` for arithmetic.

---

## 2. THE 4 ACTIVE UNFIXED BUGS

This section is the most important part of this file. These bugs have been correctly diagnosed in previous sessions but the fixes never made it to production. Read the exact root cause and the exact fix for each one before writing a single line of code.

---

### BUG 1 — Auto-Login After Logout

**Symptom:** User clicks Logout. The app shows the landing page. User navigates away and comes back, or simply refreshes the tab. The app immediately boots back into the dashboard without the user logging in again.

**Root cause — two compounding failures working together:**

The first failure is that `clearAuthSessionState()` in `app.js` only clears our own localStorage keys. Here is what it actually does:

```javascript
function clearAuthSessionState() {
    currentUser = null;
    currentManagerId = null;
    Storage.saveSync('starPaperCurrentUser', null);
    Storage.saveSync('starPaperRemember', false);
    localStorage.removeItem('starPaper_session');
    localStorage.removeItem('starPaperSessionUser');
    window.currentUser = null;
    window.currentManagerId = null;
}
```

It does not touch the Supabase SDK's own token. The SDK stores its JWT under the key `sb-fxcyocdwvjiyatqnaahg-auth-token` in localStorage. After logout, that key still holds a valid access token. Our code forgets the user. The SDK does not.

The second failure is that `window.__spAppBooted` is never reset to `false` anywhere in the logout sequence. It is set to `true` inside `showApp()` and never touched again during logout. However, this flag offers no real protection anyway because it lives in the JavaScript runtime — every page load destroys it and it starts as `undefined` (falsy) on a fresh load regardless.

Think of it like this: our logout is equivalent to hiding the key under the mat and calling it done. The Supabase SDK still has the master key under the floorboard. When the user returns to the page, the SDK finds its own token, fires the `onAuthStateChange` event with type `INITIAL_SESSION`, and the `shouldBootstrap` check evaluates all four of its conditions as `true` because the session exists, `__spAppBooted` is falsy, `_bootstrapping` is false, and the event type is one of the allowed ones. The app reboots without permission.

**The exact fix — four changes, all must be applied together:**

In `supabase.js`, replace the `signOut()` function with this version that sets a persistent flag and clears the SDK's own token synchronously before the async server call:

```javascript
async function signOut() {
    // 1. Set persistent flag FIRST — before anything async, so it survives
    //    a page reload even if the server call below fails
    localStorage.setItem('sp_logged_out', '1');
    // 2. Explicitly clear the Supabase SDK's own token
    const sdkTokenKey = 'sb-fxcyocdwvjiyatqnaahg-auth-token';
    localStorage.removeItem(sdkTokenKey);
    localStorage.removeItem(sdkTokenKey + '-code-verifier');
    // 3. Reset internal module state immediately — do not wait for server
    _session  = null;
    _profile  = null;
    _activeTeamId = null;
    localStorage.removeItem('sp_active_team');
    setActiveTeamRole(null);
    // 4. Tell the server to invalidate the token — best-effort, never blocking
    db.auth.signOut().catch(() => {});
}
```

In `supabase.js`, add this as the very first check inside `onAuthStateChange`:

```javascript
db.auth.onAuthStateChange(async (event, session) => {
    // If user explicitly logged out, refuse to bootstrap on any stale token
    if (localStorage.getItem('sp_logged_out') === '1') {
        _session = null;
        if (session) db.auth.signOut().catch(() => {});
        return;
    }
    // ... rest of handler unchanged
```

In `supabase.js`, at the very start of `bootstrapFromSupabaseSession()`, clear the logout lock after confirming a real session exists:

```javascript
async function bootstrapFromSupabaseSession(session, options = {}) {
    const activeSession = session || _session || await getSession();
    if (!activeSession?.user) return false;
    // A real new login — clear the logout lock so the app can boot
    localStorage.removeItem('sp_logged_out');
    // ... rest of function unchanged
```

In `app.js`, add this as the very first check inside `checkAuth()`:

```javascript
function checkAuth() {
    // Respect an explicit logout — never auto-boot after the user logged out
    if (localStorage.getItem('sp_logged_out') === '1') {
        setActiveScreen('landingScreen');
        return;
    }
    // ... rest of checkAuth unchanged
```

---

### BUG 2 — Cloud Data Never Loads (Timeout on All Browsers)

**Symptom:** After login, a toast appears saying "Cloud data is taking too long to load. Showing the app now." The app loads but shows data from localStorage only. The console shows `[StarPaper Supabase] bootstrap.data.timeout`. No booking, expense, or artist data from the cloud ever appears.

**Root cause — a proven URL typo:**

The URL in `supabase.js` line 2 is:

```javascript
const SP_SUPABASE_URL = 'https://fxcyocdwjiyatqnaahg.supabase.co';
//                                         ^^ no 'v' here — position 10-11
```

The JWT anon key in the same file was decoded and its payload contains the real project ref that the key was signed for:

```json
{ "iss": "supabase", "ref": "fxcyocdwvjiyatqnaahg", "role": "anon" }
//                                         ^^ 'v' is here
```

The URL says `fxcyocdwjiyatqnaahg`. The JWT says `fxcyocdwvjiyatqnaahg`. The URL points to a Supabase project that does not exist. Every single database call fails instantly with a DNS resolution error. The 8-second `withTimeout()` guard fires, logs the timeout, and the app falls back to localStorage. This is why the app feels usable at all — it has been running entirely on local data since the project was deployed. The cloud backend is functionally unreachable.

You can prove this right now by decoding the JWT in any browser console:

```javascript
// Decode the anon key to read the real project ref
JSON.parse(atob('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4Y3lvY2R3dmppeWF0cW5hYWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Nzg4NDEsImV4cCI6MjA4ODU1NDg0MX0.OTtDpyfA69rbVOTJkBh51pwj3wEkR1L04x4ouDkeWZ0'.split('.')[1]))
// Returns: { ref: "fxcyocdwvjiyatqnaahg", ... } — the 'v' is there
```

**The exact fix — one character in `supabase.js` line 2:**

```javascript
// WRONG (current state):
const SP_SUPABASE_URL = 'https://fxcyocdwjiyatqnaahg.supabase.co';

// CORRECT:
const SP_SUPABASE_URL = 'https://fxcyocdwvjiyatqnaahg.supabase.co';
```

This single change will unblock Bugs 3 and 4 simultaneously, because both of them are downstream consequences of the database being unreachable.

---

### BUG 3 — Team Panel Times Out After 8 Seconds

**Symptom:** User clicks the Team button. The panel opens with "Loading…". After exactly 8 seconds it shows "Team data took too long to load. Check your connection and try again."

**Root cause — primarily Bug 2, with a secondary RLS recursion issue:**

The primary cause is the wrong Supabase URL from Bug 2. `getMyTeams()` makes a database call. With the wrong URL the call fails immediately and the 8-second timeout fires. Fix Bug 2 and this symptom largely disappears.

However, there is a secondary issue that will manifest after the URL is corrected. The `team_members` table has RLS policies written as `FOR ALL`, which applies the `USING` clause to SELECT operations too. If `get_my_team_ids()` does not exist in the database, the fallback policy contains a subquery against `team_members` inside the policy on `team_members` — a recursive evaluation that PostgreSQL terminates with an error, which the app-side timeout then catches.

**The exact fix:** After correcting the URL, re-run `schema.sql` in the Supabase SQL Editor. The schema creates `get_my_team_ids()` as a `SECURITY DEFINER` function that breaks the recursion, and it separates the `FOR ALL` policies into distinct `FOR SELECT`, `FOR UPDATE`, and `FOR DELETE` policies. You can verify the function exists by running `SELECT proname FROM pg_proc WHERE proname = 'get_my_team_ids';` in the SQL Editor — if it returns no rows, the schema was never fully applied.

---

### BUG 4 — Cross-Browser and Cross-Device Data Sync Failure

**Symptom:** Data saved in Chrome is invisible in Opera, Firefox, or on another device. Each browser has its own completely separate copy of the data.

**Root cause — same as Bug 2:**

This is not a separate bug. It is the direct, unavoidable consequence of the wrong Supabase URL. All writes go to localStorage only. localStorage is sandboxed per browser per device by design — Chrome's localStorage and Opera's localStorage are physically separate storage locations that can never see each other's data. Since no data ever reaches the cloud, there is no shared layer. Each browser is effectively an isolated offline-only app.

**The exact fix:** Fix Bug 2. Once the URL is corrected and deployed, writes will flow to Supabase. The built-in `migrateLocalStorageData()` function in `supabase.js` will run automatically on the first successful login after the fix, pushing all existing localStorage data to the cloud.

---

## 3. WHY PREVIOUS FIXES FAILED — THE DEPLOYMENT TRAP

Every diagnosis in previous sessions was correct. The fixes were written correctly. They failed to have any effect because **the fixes were never actually deployed to production.**

Here is what was happening: Netlify deploys work by replacing the entire site with the contents of an uploaded folder. The correct method is to take the complete project folder, replace the modified files inside it, and drag the entire folder to Netlify. What was actually happening was that individual output files (just `supabase.js`, just `app.js`) were being dragged to Netlify instead of the full folder. When you drag individual files, Netlify creates a new deployment containing only those files — every other file (styles.css, index.html, manifest.json, all the logo files, all the satellite JS modules) simply disappears from the deployment. The site appears broken but the user never sees the broken state because the old service worker is still active in their browser, serving the complete old cached version from before the deployment.

In other words: the browser was serving the old, unfixed code from the SW cache. The new deployment files existed on Netlify's CDN but the SW never let the browser fetch them. The fixes were invisible.

This was confirmed by the persistent `manifest.json?v=14 404 (Not Found)` errors visible in the console across every session. `manifest.json` is a tiny file that requires zero effort to include. The fact that it was always 404 on the live site proved that deployments only ever contained a subset of the project files — the complete folder was never uploaded.

**The only correct deployment process is:**

First, locate the complete Star Paper project folder on your local machine — the folder that contains `index.html`, `styles.css`, `supabase.js`, `app.js`, `sw.js`, all the logo PNG and SVG files, and all the satellite JS modules.

Second, replace the specific files you edited inside that folder with the updated versions.

Third, drag the **entire folder** — not individual files, not a selection, the entire folder — to the Netlify dashboard deploy zone at netlify.com/drop.

Fourth, after the deploy completes (about 30 seconds), open the live URL in an incognito window to bypass your local SW cache.

Fifth, open DevTools → Application → Service Workers, find the Star Paper worker, and click Unregister. This forces the browser to discard the old cache and fetch fresh files from the new deployment.

Sixth, hard-refresh with Ctrl+Shift+R.

Seventh, run this verification command in the console to confirm the correct `supabase.js` is now being served:

```javascript
fetch('/supabase.js').then(r => r.text()).then(t => console.log(t.substring(150, 350)))
```

The output must contain `fxcyocdwvjiyatqnaahg` with the `v`. If it shows `fxcyocdwjiyatqnaahg` without the `v`, the old file is still being served and the deployment failed — repeat from step three.

---

## 4. Technology Stack

Star Paper's entire frontend is written in **Vanilla JavaScript (ES6+)** with zero runtime frameworks. No React, no Vue, no bundler, no npm. This is a deliberate architectural choice that keeps the app deployable as a plain static folder, debuggable without a build step, and fast on low-end Android devices common in East Africa.

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS ES6+, HTML5, CSS3 |
| Styling | Custom glassmorphism CSS, 6,500+ lines in `styles.css` |
| Icons | Phosphor Icons v2.1.1 via CDN |
| Charts | Chart.js via CDN with `defer` |
| PDF reports | jsPDF 2.5.1 + html2canvas 1.4.1 via CDN with `defer` |
| Auth and DB | Supabase JS SDK v2 |
| Offline | Service Worker with Stale-While-Revalidate caching |
| PWA | `manifest.json`, standalone display mode |

---

## 5. File Structure and Responsibilities

Each file has a single non-negotiable responsibility. Never mix concerns across files.

```
index.html          — App shell. All HTML (~1,665 lines). Zero logic.
styles.css          — All CSS (~6,500 lines). Single file. No imports.
supabase.js         — Cloud layer ONLY. Auth, DB sync, teams, currency.
app.migrations.js   — localStorage schema migrations. Runs once on boot.
app.actions.js      — Declarative action dispatcher for data-action clicks.
app.todayboard.js   — Today Board widget, alert calculation and rendering.
app.tasks.js        — Task board module, scoped per user, cloud-synced.
app.js              — Core engine. 300+ functions. All business logic.
sw.js               — Service Worker. Cache management. Offline fallback.
manifest.json       — PWA manifest. Icons and shortcuts.
schema.sql          — Supabase schema. Idempotent. Run in SQL Editor.
```

The satellite modules (`app.migrations.js`, `app.actions.js`, `app.todayboard.js`, `app.tasks.js`) communicate with `app.js` exclusively through `window.*` globals. They must never import or require each other.

---

## 6. CRITICAL: Script Load Order

Scripts must load in this exact sequence. The reason for every position is documented below because changing the order causes silent, hard-to-diagnose failures.

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

The Supabase SDK is in `<head>` without `defer` because deferred loading is asynchronous. If deferred, `supabase.js` would execute before `window.supabase` exists, hit its CDN fallback loader, yield the JS thread while fetching, and `app.js` would then call `checkAuth()` while `window.SP` was still undefined. The synchronous `<head>` load guarantees `window.supabase` exists before any of our scripts run.

`supabase.js` loads before `app.js` because it patches `window.login`, `window.signup`, `window.logout`, and `window.saveUserData`. The `app.js` window-exposure block uses `||=` assignment (set only if not already defined) so whichever script sets these functions first wins. `supabase.js` must win.

`app.migrations.js` loads second so the localStorage schema is current before any code reads from it.

`app.actions.js` loads third and sets `window.__starPaperActionsBound = true`. `app.js` checks this flag before registering its fallback dispatcher — whoever sets it first wins as the action router.

Never add `defer` or `async` to any of our custom scripts.

---

## 7. Current File Versions — Unfixed Production State

These are the versions currently serving at the live URL. All predate the fixes.

| File | Version | SW cached | Status |
|---|---|---|---|
| `supabase.js` | unversioned | YES | **BROKEN** — wrong URL missing 'v', no logout lock |
| `app.js` | `?v=24` | YES | **BROKEN** — no sp_logged_out guard in checkAuth |
| `app.migrations.js` | `?v=9` | YES | OK |
| `app.actions.js` | `?v=8` | YES | OK |
| `app.todayboard.js` | `?v=1` | YES | OK |
| `app.tasks.js` | `?v=2` | YES | OK |
| `sw.js` | — | — | `star-paper-shell-v27` |
| `manifest.json` | `?v=14` | **404** | **MISSING from every deploy so far** |

When applying all fixes, increment the version query strings in `index.html` for every edited file and bump `CACHE_NAME` in `sw.js`.

---

## 8. Dual-Layer Authentication Architecture

Star Paper runs two parallel auth systems simultaneously. Both can independently trigger `showApp()`. Understanding both is essential before touching any auth-related code.

**Layer 1 — Local Auth** runs in `app.js`. On every page load, `checkAuth()` reads `starPaper_session` and `starPaperSessionUser` from localStorage. If a valid local session exists, it calls `loadUserData()` then `showApp()` immediately, with no network required. This is what makes the app feel instant for returning users.

**Layer 2 — Supabase Auth** runs in `supabase.js`. After the page loads, `getSession()` checks for a live Supabase JWT. If found, `bootstrapFromSupabaseSession()` fetches cloud data and updates the local session state. The `onAuthStateChange` listener also handles OAuth redirects and token refreshes.

The guard `window.__spAppBooted` prevents double-rendering — once `true`, subsequent `showApp()` calls are no-ops. This flag is never reset on logout in the current code, but this is mostly moot because the flag is destroyed on every page unload. The real problem is the SDK's persistent token in localStorage surviving logout, which is what Bug 1 exploits.

`window.__spSupabaseReady` is set to `true` at the very end of the `supabase.js` IIFE. The event `sp-supabase-ready` fires simultaneously. Code in `checkAuth()` waits for this event before attempting to use `window.SP`. Never call `window.SP.*` before this flag is set.

---

## 9. Data Flow: Cloud and Offline Together

On boot via the cloud path, the sequence is: `bootstrapFromSupabaseSession()` → `loadAllData()` → sets `window._SP_cloudData` → `loadUserData()` in `app.js` consumes `_SP_cloudData`, populates the in-memory arrays (`bookings`, `expenses`, `otherIncome`, `artists`), and writes them back to localStorage as an offline cache.

On boot via the offline path, the sequence is: `checkAuth()` finds a valid local session → `loadUserData()` reads `getManagerData(getActiveDataScopeKey())` directly from localStorage → populates the same arrays. No network involved.

On save, `saveUserData()` writes to localStorage first (synchronous, cannot fail), then calls `window.SP.saveAllData()` asynchronously. Cloud failure never causes data loss because localStorage already has the write.

ID strategy is important to understand for avoiding duplicates. Local records use `Date.now()` as IDs. Cloud records use Supabase UUIDs. Every cloud table has a `legacy_id` column that stores the original local ID. The unique constraint is `(legacy_id, owner_id)`. After every upsert, `patchIds()` in `supabase.js` back-fills the Supabase UUID into the live in-memory array so future saves hit the existing row instead of creating a new one. If you skip this, every save cycle creates duplicate rows.

`window._SP_syncFromCloud(data)` is the live re-injection bridge. `supabase.js` can call it at any time to push fresh cloud data into the running app, updating all arrays and re-rendering. Used after team switches and on delayed cloud responses.

---

## 10. Key Global State Variables

These live inside the `DOMContentLoaded` closure in `app.js` and are also exposed on `window`.

| Variable | Type | Description |
|---|---|---|
| `currentUser` | string or null | Display username of logged-in manager |
| `currentManagerId` | string or null | Local ID with `mgr_` prefix. NOT the Supabase UUID |
| `currentTeamRole` | string or null | `owner`, `manager`, `viewer`, or null |
| `bookings` | Array | In-memory booking records for current scope |
| `expenses` | Array | In-memory expense records for current scope |
| `otherIncome` | Array | In-memory other income records for current scope |
| `artists` | Array | All artists for current scope |
| `managerData` | Object | localStorage cache: `{ [scopeKey]: { bookings, expenses, otherIncome } }` |
| `revenueGoals` | Object | `{ [scopeKey]: UGX integer }` |
| `bbfData` | Object | `{ [scopeKey_YYYY-MM]: UGX integer }` |
| `window.__spAppBooted` | boolean | True after `showApp()` executes. Guards double-render. Never reset on logout currently. |
| `window.__spSupabaseReady` | boolean | True after `supabase.js` IIFE fully completes |

`getActiveDataScopeKey()` is the function that determines which data partition to read and write. It returns `team:{teamId}` if a team is active, otherwise `currentManagerId`. Always use this function. Never hardcode a scope key anywhere.

---

## 11. The `window.SP` Public API

This is the only sanctioned way to interact with Supabase from outside `supabase.js`. The `supabase.js` IIFE maintains private state (`_session`, `_profile`, `_activeTeamId`, `_currency`, etc.) that is not directly accessible. Use the API.

Auth methods include `SP.login(email, password)`, `SP.signup(username, email, password, phone)`, `SP.logout()`, `SP.getSession()`, `SP.getProfile()`, `SP.updateProfile(updates)`, `SP.signInWithGoogle()`, and `SP.bootstrap(session, options)`.

Data methods include `SP.loadData()`, `SP.loadAllData()`, `SP.saveData(payload)`, `SP.saveAllData(payload)`, `SP.saveArtists(artists)`, `SP.loadTasks()`, `SP.saveTasks(tasks)`, and delete methods for each record type.

Team methods include `SP.createTeam(name)`, `SP.getMyTeams()`, `SP.joinTeamByCode(code)`, `SP.getTeamMembers(teamId)`, `SP.switchTeam(teamId)`, `SP.leaveTeam(teamId)`, `SP.updateTeamMemberRole()`, `SP.removeTeamMember()`, and `SP.showTeamModal()`.

State accessors: `SP.getOwnerId()` returns the Supabase UUID (not the local `mgr_` ID). `SP.getActiveTeamId()` returns the current team UUID or null. `SP.getActiveTeamRole()` returns the role string. `SP.getSessionState()` returns the raw session object. `SP.getProfileState()` returns the cached profile.

---

## 12. Atomic RPCs — Do Not Revert These

Two critical team operations run as single Supabase RPC calls and must stay that way:

`create_team_with_member(p_name, p_owner_id)` creates a team and adds the owner as a member in one server-side transaction. `join_team_by_code(p_invite_code, p_user_id)` validates the invite code and inserts the member in one transaction.

The reason these exist as RPCs is that the Supabase SDK acquires a Web Lock for every auth-bearing request. Two rapid sequential `db.from()` calls cause `AbortError: Lock broken by steal`. The RPCs eliminate this by doing both operations in a single round-trip. If you ever see the impulse to "simplify" these into two sequential queries, resist it — the Web Lock error will return immediately.

---

## 13. Database Schema

`schema.sql` must be run in the Supabase SQL Editor to initialise or update the database. It is fully idempotent and safe to re-run at any time.

Tables are `profiles`, `teams`, `team_members`, `artists`, `bookings`, `expenses`, `other_income`, `revenue_goals`, `bbf_entries`, `tasks`, `closing_thoughts`, and `messages`. RLS is enabled on every table. Policies ensure users only see rows where `owner_id = auth.uid()` (solo mode) or where `team_id` matches a team they belong to (team mode). RLS is never disabled.

Legacy ID unique constraints are required for correct upsert behaviour. If any of these constraints are missing, every `saveUserData()` call will create duplicate rows rather than updating existing ones. The four constraints are `bookings_legacy_id_owner_id_key`, `expenses_legacy_id_owner_id_key`, `other_income_legacy_id_owner_id_key`, and `artists_legacy_id_owner_id_key`, all defined on `(legacy_id, owner_id)`.

---

## 14. localStorage Key Registry

Every key used in the app is listed here. Never invent new keys without adding them to this table.

| Key | Owner | Description |
|---|---|---|
| `starPaper_session` | app.js | Active session marker. Value: `"active"` |
| `starPaperSessionUser` | app.js | Username of the active session |
| `starPaperCurrentUser` | app.js | Persisted username when Remember Me is checked |
| `starPaperRemember` | app.js | Boolean, Remember Me state |
| `starPaperUsers` | app.js | Array of manager profile objects |
| `starPaperCredentials` | app.js | Map of username to hashed credential record |
| `starPaperArtists` | app.js | Array of all artist objects |
| `starPaperManagerData` | app.js | `{ [scopeKey]: { bookings, expenses, otherIncome } }` |
| `starPaperRevenueGoals` | app.js | `{ [scopeKey]: UGX integer }` |
| `starPaperBBF` | app.js | `{ [scopeKey_YYYY-MM]: UGX integer }` |
| `starPaperClosingThoughtsByPeriod` | app.js | `{ [scopeKey]: { [period]: text } }` |
| `starPaperTasks:{scopeKey}` | app.tasks.js | Array of task objects per user or team |
| `starPaperSchemaVersion` | app.migrations.js | Integer, currently `2` |
| `starPaperTheme` | app.js | `"dark"` or `"light"` |
| `starPaperSeedDemo` | app.js | `"true"` enables demo data seeding (dev only) |
| `sp_active_team` | supabase.js | Active team UUID or empty string |
| `sp_currency` | supabase.js | Active currency code, e.g. `"UGX"` |
| `sp_logged_out` | **TO BE ADDED** | Logout lock flag. Value `"1"`. **Does not exist yet — this is part of the Bug 1 fix.** |
| `sp_migrated_{userId}` | supabase.js | Per-user cloud migration completion flag |
| `sp_density` | app.js | `"comfortable"` or `"compact"` |
| `sp_sidebar_collapsed` | app.js | `"1"` if sidebar is collapsed on desktop |
| `sb-fxcyocdwvjiyatqnaahg-auth-token` | Supabase SDK | **THE KEY THAT CAUSES BUG 1.** The SDK's own JWT storage. Our logout code currently never clears this. It must be explicitly deleted inside `signOut()`. |

---

## 15. Financial Data Rules

All money values are stored as **UGX integers** in both localStorage and the database. The `fee`, `deposit`, `balance`, and `amount` columns in Postgres are `NUMERIC` type but must always contain whole numbers. When reading from the DB, always wrap values in `Number(row.fee) || 0` and then `Math.round()` to strip any floating-point artifacts introduced by JSON transport. The `balance` field on a booking is always re-derived as `fee - deposit` before saving — never trust a stale stored balance.

Currency conversion is a display-only operation. `SP_formatCurrencyFull(ugxAmount)` in `supabase.js` converts for rendering. The stored value never changes. Switching currencies changes how numbers look, not what numbers are stored.

---

## 16. Action Dispatch System

Buttons use `data-action="functionName"` attributes. `app.actions.js` registers a document-level click listener that reads this attribute and calls `window[functionName]()`. There is intentional triple-layer redundancy to prevent silent failures:

The primary dispatcher is `app.actions.js`, registered first, setting `window.__starPaperActionsBound = true`. The fallback is `app.js`'s `bindDeclarativeActionFallback()`, which only runs if that flag is false. The third layer is inline `onclick="functionName()"` attributes on every critical button. A fourth capture-phase listener in `wireCriticalButtons()` at the bottom of `index.html` covers the highest-priority operations.

Never remove the `onclick` attributes from existing buttons. They are the last line of defence, not decoration.

---

## 17. CSS Architecture

All styles live in `styles.css`, a single file with 39 numbered sections. The core palette uses `--gold-amber: #FFB300` as the primary accent, `--onyx-deep: #0B0B0B` as the background, and `--text-primary: #FFFFFF` as body text. Light theme is applied via `body.light-theme`. Compact density via `body.sp-density--compact`. The layout is mobile-first with breakpoints at 360px, 480px, 768px, and 1025px. Never use `!important` outside the designated density override sections.

---

## 18. Service Worker and Cache Versioning

`sw.js` has a `CACHE_NAME` constant currently at `star-paper-shell-v27`. The `APP_SHELL` array lists every pre-cached file. You must bump `CACHE_NAME` when any JS file, `index.html`, or `manifest.json` changes. You do not need to bump it for CSS-only changes, because the Stale-While-Revalidate strategy serves fresh CSS automatically. The version number in `sw.js` and the `?v=N` query strings on script tags in `index.html` do not have to be identical but must be incremented consistently on every deploy.

---

## 19. Verification Commands

Run these in the browser console to confirm the state of the code actually running in the browser. Never trust visual appearance alone — always verify.

```javascript
// MOST IMPORTANT — confirm which supabase.js is loaded
// Must show 'fxcyocdwvjiyatqnaahg' with the 'v'
fetch('/supabase.js').then(r => r.text()).then(t => console.log(t.substring(150, 350)))

// Confirm the correct project ref from the JWT (this is ground truth)
JSON.parse(atob('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4Y3lvY2R3dmppeWF0cW5hYWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Nzg4NDEsImV4cCI6MjA4ODU1NDg0MX0.OTtDpyfA69rbVOTJkBh51pwj3wEkR1L04x4ouDkeWZ0'.split('.')[1]))
// Returns: { ref: "fxcyocdwvjiyatqnaahg" ... }

// Confirm the SDK token still exists AFTER logout (proves Bug 1 is still active)
// Run AFTER clicking logout — if this returns anything other than null, Bug 1 is unfixed
localStorage.getItem('sb-fxcyocdwvjiyatqnaahg-auth-token')

// Confirm sp_logged_out does not exist yet (pre-fix state)
localStorage.getItem('sp_logged_out')
// Should return null currently

// Test cloud DB connectivity — only works after URL is fixed
window.SP?.client?.from('profiles').select('id').limit(1).then(r => console.log(r))
// Pre-fix: returns { data: null, error: { message: "DNS..." } }
// Post-fix: returns { data: [{ id: '...' }], error: null }

// Confirm app.js version currently running
document.querySelector('script[src*="app.js"]')?.src
// Currently returns ?v=24
```

---

## 20. All Four Fixes — Consolidated Action List

When a future session applies all fixes, these are the exact changes needed:

**In `supabase.js`:** Change line 2 from `fxcyocdwjiyatqnaahg` to `fxcyocdwvjiyatqnaahg` (add the missing 'v'). Replace `signOut()` with the version that sets `sp_logged_out`, clears `sb-fxcyocdwvjiyatqnaahg-auth-token`, resets `_session` and `_profile` synchronously, then calls `db.auth.signOut()` as background best-effort. Add the `sp_logged_out` check as the first action in `onAuthStateChange`. Add `localStorage.removeItem('sp_logged_out')` as the first action in `bootstrapFromSupabaseSession()` after confirming the session is real.

**In `app.js`:** Add the `sp_logged_out` check as the very first line of `checkAuth()` — if the flag is `'1'`, call `setActiveScreen('landingScreen')` and return.

**In Supabase SQL Editor (not a file change):** Re-run the full `schema.sql` to ensure `get_my_team_ids()` exists, RLS policies are correctly split, and all `legacy_id` unique constraints exist.

**After editing files:** Increment version strings in `index.html` for every edited JS file. Bump `CACHE_NAME` in `sw.js`. Deploy the **complete project folder** to Netlify (not individual files). Unregister the service worker in the browser. Hard-refresh. Run the verification commands above to confirm the correct code is running.

---

## 21. Adding New Features

Every new feature must satisfy this checklist before it is complete. Does it store data? Write to localStorage first (synchronous, guaranteed), then cloud (async, best-effort). Does it involve money? UGX integers only, `Math.round(Number(value) || 0)`, test with zero, with UGX 500,000,000, and with negative balances. Does it touch the UI? Test at 375px viewport width in both dark and light themes. Does it add a button? Use `data-action="fnName"` plus inline `onclick="fnName()"` fallback and add `window.fnName ||= fnName` to the window exposure block in `app.js`. Does it use Supabase? Every query must go through `applyScopeFilter()` or `applyUserScopeFilter()` — never query without a scope filter. Does it add a new table? Add it to `schema.sql` with `CREATE TABLE IF NOT EXISTS` and RLS enabled, then re-run the schema.

---

## 22. Local Development

Google OAuth requires http or https and does not work on `file://` protocol. For local OAuth testing use a local server with `npx serve .` which serves on `http://localhost:3000`. Add that URL to the Supabase Redirect URLs list under Authentication → URL Configuration.

For quick offline testing with no server, click the `🧪 Local Test Mode` button on the login screen. It creates a `TestUser` session in localStorage and boots the full app with no cloud dependency. A visible `DEV MODE` badge appears. This is safe to ship — the button has no effect on https deployments.

---

## 23. Project Context and Engineering Philosophy

This is a single-developer production SaaS with real users and real financial data. There is no staging environment. Test in incognito before communicating any fix to users.

The codebase is intentionally monolithic in places — `app.js` is approximately 8,900 lines — because debuggability is prioritised over modularity at this stage of the project. When suggesting a refactor, present it as optional future work, never as a prerequisite to fixing the current task.

The hardest part of this project is not the code. It is ensuring that fixed code actually reaches the browser. The service worker, Netlify's deployment model, and browser caching create a three-layer system where a "deployed" fix can be completely invisible to users. A fix that is not verified with the console commands in Section 19 is a fix that does not exist.
