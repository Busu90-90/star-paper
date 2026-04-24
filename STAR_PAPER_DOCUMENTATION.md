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
- retry queue
- currency preference
- sidebar state

Those keys help with UX but must not override cloud truth.

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
- retry queue and sync indicator

### `app.reports.js`

Owns:

- report presentation
- PDF generation
- BBF-aware PDF summaries

### `app.tasks.js`

Owns:

- task rendering and task interactions

### `schema.sql`

Defines:

- tables
- constraints
- RLS policies
- RPCs
- indexes

### `sw.js`

Owns:

- service worker shell caching
- cache versioning
- freshness behavior for deployed assets

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

### Auth callback return

Expected behavior:

- show the boot loader while the auth callback is processed
- exchange or restore the Supabase session
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

### Sign-out

Expected behavior:

- clear runtime session state
- set the logout guard
- remove authoritative local auth remnants
- return to login or landing as designed

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
3. Load cloud data.
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

## Sync Model

Star Paper is designed for:

- same-account persistence after refresh
- same-account persistence after sign-out/sign-in
- same-account visibility across different browsers
- same-account visibility across different devices

Sync depends on:

- successful cloud writes
- valid RLS and schema in the live Supabase project
- refresh/focus/interval/realtime refresh behavior

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
- `sp_retry_queue`
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

## Deployment and Caching

Star Paper uses a service worker, so deploy hygiene matters.

### Deploy together

When shipping auth, sync, reports, or boot changes, deploy matching versions of:

- `app.js`
- `supabase.js`
- `app.reports.js`
- `app.tasks.js`
- `styles.css`
- `index.html`
- `sw.js`

### Cache rule

If asset versions change in `index.html`, the service worker cache list and cache name must be updated as well.

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
