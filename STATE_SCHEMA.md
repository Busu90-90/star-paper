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

### Supabase contract

The live Supabase project must be kept in lockstep with `schema.sql`. The runtime relies on these schema surfaces during boot and normal operation:

- `profiles`: `username`, `email`, `phone`, `bio`, `avatar`, `preferred_currency`, `preferred_theme`, and `last_active_team_id`
- `teams`: `name`, `owner_id`, `invite_code`, and `created_at`
- `team_members`: `team_id`, `user_id`, `role`, `permissions`, and `joined_at`; `permissions` is role-derived and must match `team_role_permissions(role)`
- business tables: `owner_id` or `user_id`, `team_id`, `legacy_id` where present, cloud UUID `id`, and the domain columns selected by `supabase.js`
- helper RPCs: `get_bootstrap_payload`, `get_my_team_context`, `get_team_members_context`, `create_team_with_member`, `join_team_by_code`, `is_username_available`, `get_my_team_ids`, `has_team_permission`, and `team_role_permissions`

`get_bootstrap_payload(uid)` is the loader-blocking fast path. It must return `profile`, `teams`, `workspace.ownerId/teamId/scopeKey/source/role/permissions`, the `data.*` payload for bookings, expenses, other income, artists, audience metrics, tasks, revenue goal, BBF entries, and closing thoughts, plus `meta.complete`, `meta.missingKeys`, and `meta.generatedAt`.

The retry queue remains browser-local transport state. It replays only under the same Supabase user and workspace; schema, RLS, or missing-constraint errors are not queued for later replay.

Before live constraint hardening, run `scripts/supabase-migration-readiness.sql` in the Supabase SQL Editor. Any blocker row means the live project still has data that can stop `schema.sql`, especially duplicate nonblank `profiles.username`, duplicate valid nonblank `teams.invite_code`, or duplicate `legacy_id` values inside the same personal or team workspace.

After applying `schema.sql`, run `scripts/supabase-post-apply-verification.sql`. If production has no sample rows for helper-covered active probes, run `scripts/supabase-post-apply-canary-proof.sql`; it creates disposable team/workspace rows, proves the live triggers and `team_members` permission constraint reject forbidden updates, and rolls those rows back before returning findings.

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
