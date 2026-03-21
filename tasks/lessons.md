# Star Paper - Lessons Learned

## Session: Workflow Correction (2026-02-27)

### Lesson 12: PDF image assets need a non-fetch fallback
**What happened**: Report PDFs rendered without top-right logo even after adding per-page logo drawing.

**Root cause**: Logo loading depended on `fetch()` with cache-busted local asset paths, which can fail in some runtime contexts (especially direct local file usage) before `jsPDF.addImage`.

**Fix**: Resolve report logo via layered strategy: plain file paths first, fetch when available, and fallback to `Image` decode + canvas data URL conversion. Keep per-page logo drawing pass before save.

**Rule**: For client-side PDF branding assets, never rely on a single network-style loader path; always include an `Image` element decode fallback.

### Lesson 13: Cache-bust runtime script/service-worker changes when fixing production-visible UI bugs
**What happened**: User still saw old PDF behavior after code changes.

**Root cause**: Browser/service-worker stale cache can keep serving prior `app.js` even after local edits.

**Fix**: Bump script query versions (`app.js?v=...`), service worker URL (`sw.js?v=...`), and cache name together on user-visible hotfixes.

**Rule**: If a UI bug appears "fixed in code but unchanged in app", treat cache versioning as part of the fix, not a follow-up.

### Lesson 14: Deleting legacy seeded entities must run on load, not only during re-seed
**What happened**: A retired mock artist still appeared because the cleanup was tied to the "Load Mock Portfolio Data" action.

**Root cause**: Existing persisted records are not touched unless the re-seed flow is explicitly triggered.

**Fix**: Add deterministic cleanup in the normal data load path (`loadUserData`) to remove retired artist names and dependent bookings automatically.

**Rule**: Any retirement/removal of legacy seed data must execute during app load for the current manager.

### Lesson 15: Retire exact names only when replacing mock artists
**What happened**: A broad retirement rule removed `Cindy Sanyu` after the roster direction changed.

**Root cause**: Cleanup list included both the typo/legacy name and the canonical name.

**Fix**: Keep retirement lists minimal and exact (only `Cinderella Sanyu`), and validate against current seed roster before deployment.

**Rule**: Never retire a canonical mock artist name unless explicitly requested in the latest roster decision.

### Lesson 11: Dashboard data streams must share one presentation system
**What happened**: User requested Today Board alerts to visually follow the same rules as Upcoming Shows and Recent Activity across themes and devices.

**Root cause**: Today alerts evolved as a separate style stack (`.today-board-alert*`) instead of reusing the existing timeline component system.

**Fix**: Render alerts with shared timeline markup/classes and maintain only minimal alert-variant tokens (severity accents), not a parallel component style tree.

**Rule**: If two dashboard sections represent the same class of data cards, they must use the same base HTML/CSS component path for light/dark and responsive parity.

### Lesson 8: Non-trivial work must begin with explicit plan discipline
**What happened**: User requested stricter orchestration: plan-first, verification-first, and re-plan on drift.

**Root cause**: Execution can move too quickly into implementation without a formal gating loop.

**Fix**: Treat all 3+ step or architectural tasks as plan-gated work with checklist tracking.

**Rule**: No non-trivial implementation begins before a checkable plan is written in `tasks/todo.md`.

---

### Lesson 9: Verification is a completion gate, not a nice-to-have
**What happened**: User required proof before completion and explicit behavior validation.

**Root cause**: Completion can be declared after code changes without sufficiently demonstrating correctness.

**Fix**: Add verification steps to plan and require evidence (tests/logs/behavior checks) before closeout.

**Rule**: "Done" requires proof. No proof, no completion.

---

### Lesson 10: Apply continuous self-correction after user feedback
**What happened**: User required lessons capture after any correction.

**Root cause**: Process improvements were not guaranteed to be persisted immediately.

**Fix**: Update `tasks/lessons.md` in the same turn when user provides corrective process guidance.

**Rule**: Every user correction creates or updates at least one concrete preventive rule.

## Session: Dashboard Redesign Analysis

### Lesson 1: Information Architecture Matters More Than Features
**What happened**: Dashboard had 4 equal-weight cards with no visual hierarchy. User couldn't determine priority.

**Root cause**: Feature-first thinking instead of user-goal-first thinking.

**Fix**: Create dominant "Today Board" that answers "what needs my attention today" before showing supporting data.

**Rule**: Always establish visual hierarchy. One primary focus zone, secondary supporting data below.

---

### Lesson 2: Navigation Should Reflect Usage Frequency
**What happened**: Sidebar had 8 nav items, treating daily-use features (Bookings, Financials) the same as rarely-used features (Reports).

**Root cause**: Flat list of every feature without considering actual usage patterns.

**Fix**: Reduce to 5 core items. Merge related sections (Financials + Expenses + Other Income = Money).

**Rule**: Navigation should mirror user behavior, not feature count. Frequently used items get top-level access.

---

### Lesson 3: Data Fragmentation Creates Cognitive Load
**What happened**: Financial data split across 3 sections (Financials, Expenses, Other Income). User had to mentally stitch together.

**Root cause**: Organizing by data type instead of user task.

**Fix**: Single "Money" section with tabs for different views of financial data.

**Rule**: Group by user goal, not by data structure. If a user needs to see multiple things to make one decision, they should be in one place.

---

### Lesson 4: Redundancy Signals Poor Information Architecture
**What happened**: Reports section was essentially a read-only summary of Financials data.

**Root cause**: Creating new sections for every output format instead of integrating outputs into source sections.

**Fix**: Merge Reports into Financials as "Download Report" button.

**Rule**: If a section only displays data from another section, it's a feature of that section, not a separate section.

---

### Lesson 5: Dual Data Entry Points Create Sync Risk
**What happened**: Calendar allowed separate event entry parallel to Bookings, creating risk of data being out of sync.

**Root cause**: Treating calendar as a data source instead of a view.

**Fix**: Calendar becomes read-only view of bookings data.

**Rule**: Single source of truth. Views can display data differently, but data entry should happen in one place.

---

### Lesson 6: Apps Should Be Proactive, Not Just Reactive
**What happened**: App had all data needed to remind user of overdue balances, upcoming shows, but never surfaced it.

**Root cause**: Building data entry tool instead of operational assistant.

**Fix**: Add smart nudge banners that surface actionable insights.

**Rule**: If the app knows something the user should act on, tell them. Don't make them hunt for it.

---

### Lesson 7: Task Management Keeps Users In-App
**What happened**: Managers had to switch to notes app for daily tasks related to bookings.

**Root cause**: Assuming app is just for record-keeping, not operational workflow.

**Fix**: Add lightweight task list to sidebar.

**Rule**: If users are leaving your app to do related work, bring that work into the app.

---

## Patterns to Apply Going Forward

1. **Visual Hierarchy**: One dominant element, supporting elements below
2. **Usage-Based Navigation**: Frequent tasks get top-level access
3. **Task-Based Grouping**: Group by user goal, not data type
4. **Single Source of Truth**: One place to enter data, multiple views to see it
5. **Proactive Intelligence**: Surface insights, don't make users hunt
6. **Workflow Integration**: If users do it alongside your app, integrate it

---

## Anti-Patterns to Avoid

1. ❌ Equal-weight cards with no hierarchy
2. ❌ Flat navigation lists treating all features equally
3. ❌ Fragmenting related data across multiple sections
4. ❌ Creating separate sections for output formats
5. ❌ Allowing dual data entry points
6. ❌ Purely reactive data display with no intelligence
7. ❌ Forcing users to leave app for related tasks
