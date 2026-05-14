# Star Paper Cloud-Only State Schema

This document describes the current Star Paper state model after the cloud-first refactor.

## 1. Source of truth

### Authoritative cloud state

The following categories are authoritative in Supabase:

- auth session
- profile
- bookings
- expenses
- other income
- artists
- tasks
- audience metrics
- revenue goals
- BBF entries
- closing thoughts
- teams
- team members
- team chat/messages

### Non-authoritative browser state

The browser may keep local helper state for:

- boot context
- logout guard
- account-scoped sync retry queue
- theme
- density
- currency preference
- sidebar collapsed state
- last-view restore
- drafts
- push subscription/device settings
- service worker shell cache

## 2. Browser storage keys

### Runtime helper keys that are still valid

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
- `starPaperPushEndpoint`
- `starPaperPushLastSend`
- `starPaperPushPublicKey`
- `starPaperPushSubscription`
- `starPaperBBFViewState`

### Legacy keys that are shadowed, ignored, or cleared in cloud-only mode

- `starPaperManagerData`
- `starPaperBookings`
- `starPaperExpenses`
- `starPaperOtherIncome`
- `starPaperArtists`
- `starPaperRevenueGoals`
- `starPaperBBF`
- `starPaperClosingThoughtsByPeriod`
- `starPaperAudienceMetrics`
- `sp_tasks`
- `starPaperTasks`
- `starPaperUsers`
- `starPaperCredentials`
- `starPaperCurrentUser`
- `starPaperRemember`
- `starPaper_session`
- `starPaperSessionUser`
- `starPaperSchemaVersion`
- `spManagers`
- `spPendingUsers`

These keys must not be treated as the active truth for authenticated business data or profile state.

## 3. Auth and boot state

### Auth source

Supabase Auth is the only valid session authority.

### Boot context values

`sp_boot_context` can represent:

- `auth-return`
- `app-shell`

At runtime these resolve to user-facing startup modes such as:

- cold-start
- auth-callback
- app-refresh

## 4. Workspace model

Star Paper supports two workspace scopes:

- personal workspace
- team workspace

Scope resolution is driven by:

- authenticated user ID
- active runtime team ID
- `profiles.last_active_team_id`
- current team membership

The runtime should default to personal workspace when no valid team is selected.

## 5. Cloud payload expectations

### Report totals

`getReportPeriodData()` returns BBF-aware totals including:

- `periodNetProfit`
- `bbf`
- `closingBalance`

Meaning:

- `periodNetProfit` measures only the selected period
- `bbf` is the opening balance brought forward
- `closingBalance = bbf + income + other income - expenses`

### Profile persistence

Profile saves are cloud-backed and update:

- `profiles.username`
- `profiles.email`
- `profiles.phone`
- `profiles.bio`
- `profiles.avatar`

Auth-sensitive changes such as email and password go through Supabase Auth first.

### Structured sync results

Cloud save flows can return structured failure metadata such as:

- `ok`
- `failedStep`
- `message`
- `context`

This allows the UI to show which cloud step actually failed.

## 6. Sync rules

For authenticated users:

- cloud-confirmed save is success
- failed cloud write is failure
- refresh must rehydrate from the cloud
- another browser on the same account must see the same records after refresh or normal sync

## 7. Service worker rule

The shell cache exists for startup speed, but auth/bootstrap-critical assets should behave network-first so stale startup logic does not persist across deploys.
