# Star Paper Redesign - Implementation Plan

## Execution Protocol (Mandatory)

### Workflow Orchestration
- [ ] For every non-trivial task, start with a written plan in this file before implementation.
- [ ] If implementation drifts or fails, stop and re-plan before continuing.
- [ ] Include verification steps in the plan (not only build steps).
- [ ] For complex analysis, use focused parallel subagent tacks to reduce context bloat.
- [ ] After each significant change, challenge solution quality ("is there a simpler/elegant approach?").
- [ ] Do not mark done without proof (tests/logs/observable behavior).

### Task Execution Rules
- [ ] Check in after plan creation before major implementation work.
- [ ] Mark checklist items complete as work progresses.
- [ ] Add a review/results section after execution with evidence.
- [ ] Update `tasks/lessons.md` after user corrections to prevent repeat mistakes.

### Engineering Principles
- [ ] Simplicity first: minimum code touch for maximum clarity.
- [ ] Root-cause fixes only: no temporary or cosmetic patches.
- [ ] Minimize blast radius: avoid unrelated edits and regressions.

## Current Task: Supabase Team AbortError Queue (2026-03-26)

### Plan
- [ ] Identify the specific Supabase calls involved in team creation + migration flows and where parallel requests are fired.
- [ ] Wire the existing serial DB queue (`dbSerial`) into team-related Supabase calls and the data load/save paths used during team migration.
- [ ] Keep blast radius minimal: only wrap the calls used in the team creation/join + migration path.
- [ ] Verify syntax and ensure no unwrapped team-flow calls remain.

### Verification
- [ ] `node --check supabase.js`
- [ ] `rg -n "createTeam|joinTeamByCode|migratePersonalDataToTeam|loadAllData|saveAllData|dbSerial" supabase.js`

### Review (to fill after implementation)
- [ ] Behavior evidence captured
- [ ] Verification commands run
- [ ] Risks/notes documented

## Current Task: Dashboard Stream Style Consolidation (2026-02-27)

### Plan
- [x] Refactor Today Board alert markup to use the shared timeline structure used by Upcoming Shows and Recent Activity.
- [x] Consolidate dashboard feed styling with one shared `dashboard-stream-item` style path and remove duplicate Today-alert visual stack.
- [x] Ensure light/dark parity for Today Board status + alert rendering and include mobile layout parity.
- [x] Verify syntax and selector integrity; document outcomes below.

### Review
- [x] Behavior evidence captured
- [x] Verification commands run
- [x] Risks/notes documented
- Evidence:
  - Today Board alerts now render as `timeline-item dashboard-stream-item dashboard-alert-item` entries (`app.todayboard.js`), matching Upcoming/Recent card structure.
  - Alert interactions remain actionable via `data-alert-action` and keyboard activation, now bound to `.dashboard-alert-item[data-alert-action]`.
  - Upcoming and Recent timeline items now include `dashboard-stream-item` class in `app.js`, allowing one shared dashboard feed rule path.
  - `index.html` Today alerts container now includes `timeline-list` class for structural consistency.
  - `styles.css` replaces standalone `.today-board-alert*` styles with shared dashboard stream + alert variant rules and light-theme parity classes.
- Verification:
  - `node --check app.todayboard.js` (pass)
  - `node --check app.js` (pass)
  - `rg -n "today-board-alert|dashboard-stream-item|dashboard-alert-item|today-board__status--|today-board-status" app.todayboard.js app.js styles.css index.html` (expected selector set; no legacy alert selectors left)
- Risks/notes:
  - Visual verification in-browser (desktop + mobile breakpoints) is still required in runtime to confirm final spacing/contrast preferences.

## Current Task: Today Board Alerts + Tasks Section Refactor (2026-02-27)

### Plan
- [x] Wire Today Board alert click handling (and keyboard activation) so alerts perform actions.
- [x] Change pending-booking alerts to be per-booking and route directly into booking edit flow.
- [x] Convert sidebar Tasks nav action from toggle behavior to section navigation (`showSection`).
- [x] Add a dedicated `Tasks` main section in `index.html` with full to-do controls.
- [x] Refactor `app.tasks.js` to support add/toggle/edit/delete/clear-completed and render in the Tasks section.
- [x] Update section routing/title/icon coverage in `app.js` for `tasks`.
- [x] Verify via syntax check and targeted grep checks; document results below.

### Review (to fill after implementation)
- [x] Behavior evidence captured
- [x] Verification commands run
- [x] Risks/notes documented
- Evidence:
  - Today Board alerts now render with `data-alert-action` + keyboard focus (`app.todayboard.js`) and route to booking edit.
  - Pending booking alerts are per-booking and call booking editor for the exact pending item.
  - Sidebar Tasks nav now uses `showSection` with `data-section="tasks"` and opens full section page.
  - Tasks page now supports add/toggle/edit/delete/clear-completed and overdue badge updates.
- Verification:
  - `node --check app.todayboard.js` (pass)
  - `node --check app.tasks.js` (pass)
  - `node --check app.js` (pass)
  - `rg -n "tasks" index.html app.js` confirms section wiring + routing entries.
- Risks/notes:
  - Functional browser click-through is still needed to validate UX flow end-to-end (not executable in this environment).

## Problem Analysis

### Current Issues
- **Dashboard lacks hierarchy**: 4 equal-weight cards (At a Glance, Upcoming Shows, Recent Activity, Tour Map) with no clear focus
- **Sidebar bloat**: 8 nav items (Dashboard, Financials, Bookings, Expenses, Other Income, Calendar, Reports, Artists) - too many for daily use
- **Financial fragmentation**: Financials, Expenses, and Other Income are separate sections requiring mental stitching
- **Redundant Reports section**: Read-only summary that duplicates Financials data
- **Calendar/Bookings overlap**: Calendar allows separate event entry, creating sync risk
- **No proactive intelligence**: App has data but never nudges or reminds

### What to Cut/Merge
- ❌ Reports as top-nav → Merge into Financials as "Download Report" button
- ❌ Calendar as data entry → Repurpose as booking calendar view only
- ❌ Other Income as top-nav → Move into Financials as tab/sub-section
- ✅ In-app footer → Already removed

## Build Order (Prioritized)

### Phase 1: Today Board (Dashboard Rework) - HIGHEST VALUE
**Goal**: Replace current dashboard with command center that answers "what needs my attention today"

**Changes**:
- [ ] Create dominant "Today Board" card at top
  - [ ] Show today's date prominently
  - [ ] List shows happening today or next 3 days
  - [ ] Display overdue balances with amounts
  - [ ] Show pending bookings awaiting confirmation
- [ ] Add revenue progress bar (this month vs goal)
- [ ] Keep "Upcoming Shows" section (next 5 shows)
- [ ] Keep "Recent Activity" feed
- [ ] Remove or minimize "Tour Map" (low daily value)

**Files to modify**:
- `index.html` - Dashboard section structure
- `styles.css` - Today Board styling with visual hierarchy
- `app.js` or `app.actions.js` - Today Board data logic

---

### Phase 2: Task List in Sidebar - STICKY UTILITY
**Goal**: Keep managers in-app for daily task management

**Changes**:
- [ ] Add collapsible task widget to sidebar
- [ ] Task data structure in localStorage: `starPaperTasks`
  - [ ] Fields: id, text, dueDate, completed, bookingId (optional link)
- [ ] UI: Add task, check off, due date badge
- [ ] Show overdue count badge on sidebar icon
- [ ] Persist to localStorage

**Files to modify**:
- `index.html` - Sidebar task widget HTML
- `styles.css` - Task list styling
- `app.migrations.js` - Add task schema if needed
- `app.actions.js` - Task CRUD operations

---

### Phase 3: Smart Nudge Banners - LOW EFFORT, HIGH IMPACT
**Goal**: Surface actionable insights proactively

**Changes**:
- [ ] Create dismissable banner component (top of dashboard)
- [ ] Implement 3 nudge types:
  - [ ] Balance nudge: "3 bookings have unpaid balances totalling UGX 12M"
  - [ ] Upcoming show nudge: "Zanzibar Beach is in 4 days. Deposit received, balance due."
  - [ ] Quiet period nudge: "No bookings in next 30 days. Usually you'd have 2 by now."
- [ ] Store dismissed nudges in localStorage to avoid repeat
- [ ] Calculate nudges on dashboard load

**Files to modify**:
- `index.html` - Nudge banner HTML
- `styles.css` - Banner styling (dismissable, non-intrusive)
- `app.actions.js` - Nudge calculation logic

---

### Phase 4: Money Section Merge (Financials + Income + Expenses) - COHERENCE
**Goal**: Single "Money" view with tabs instead of 3 separate nav items

**Changes**:
- [ ] Rename "Financials" nav item to "Money"
- [ ] Create 3-tab layout inside Money section:
  - [ ] Overview tab (current Financials content)
  - [ ] Income tab (show bookings revenue + other income in timeline)
  - [ ] Expenses tab (current Expenses content)
- [ ] Add "Download Report" button to Overview tab header
- [ ] Remove "Expenses" and "Other Income" from sidebar nav
- [ ] Remove "Reports" from sidebar nav

**Files to modify**:
- `index.html` - Restructure Financials/Expenses/Other Income sections
- `styles.css` - Tab styling
- `app.js` - Navigation logic for tabs
- `app.actions.js` - Update section references

---

### Phase 5: Calendar as Booking View Only - DATA INTEGRITY
**Goal**: Eliminate dual data entry, make calendar a read-only booking view

**Changes**:
- [ ] Remove "Add Event to Calendar" form
- [ ] Calendar displays bookings only (from bookings data)
- [ ] Clicking a date with booking opens booking detail modal
- [ ] Clicking empty date shows "No bookings on this date"
- [ ] Keep month navigation and "Today" button

**Files to modify**:
- `index.html` - Remove calendar event form
- `app.actions.js` - Calendar rendering from bookings data only

---

### Phase 6: Streaks / Momentum Widget - MOTIVATIONAL
**Goal**: Add gamification and performance awareness

**Changes**:
- [ ] Add small widget to dashboard (below Today Board)
- [ ] Calculate and display:
  - [ ] Booking streak: "🔥 3-month booking streak"
  - [ ] Best month: "Best month: Aug 2025 — 6 shows"
  - [ ] Busiest artist: "Your busiest artist this month: Wizkid (3 shows)"
- [ ] Store historical data for streak calculation

**Files to modify**:
- `index.html` - Momentum widget HTML
- `styles.css` - Widget styling
- `app.actions.js` - Streak calculation logic

---

## Data Schema Changes

### New localStorage Keys
- `starPaperTasks` - Task list data
- `starPaperDismissedNudges` - Dismissed nudge IDs with timestamps
- `starPaperMonthlyGoal` - Monthly revenue goal (already exists)
- `starPaperStreakData` - Historical booking data for streak calculation

### Migration Considerations
- No breaking changes to existing data
- New keys are additive only
- Existing bookings, expenses, income remain unchanged

---

## Success Metrics

### User Experience
- Manager opens app and knows what to do within 3 seconds
- Sidebar reduced from 8 to 5 items (Dashboard, Money, Bookings, Artists, Calendar)
- Financial data accessible in 1 click instead of 3
- Task list keeps managers in-app for daily workflow

### Technical
- No data loss or migration issues
- Maintain existing localStorage structure
- All existing features remain functional
- Performance: Dashboard loads in <500ms

---

## Implementation Notes

### Simplicity First
- Minimal code changes per phase
- Reuse existing components where possible
- No over-engineering - simple solutions only

### Testing Checklist per Phase
- [ ] Existing data loads correctly
- [ ] New features work with empty state
- [ ] New features work with populated data
- [ ] Mobile responsive
- [ ] Dark/light theme support
- [ ] No console errors

---

## Current Status
- [x] Phase 1: Today Board - HTML structure complete
- [x] Phase 1: Today Board - CSS styling complete
- [x] Phase 1: Today Board - JavaScript logic complete
- [x] Phase 2: Task List - Complete
- [ ] Phase 3: Smart Nudges
- [ ] Phase 4: Money Section Merge
- [ ] Phase 5: Calendar as Booking View
- [ ] Phase 6: Streaks Widget

**Next Action**: Phase 2 complete! Ready for Phase 3 (Smart Nudges) or testing
