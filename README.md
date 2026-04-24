# Star Paper

Star Paper is a cloud-first artist management app for bookings, expenses, other income, reports, BBF tracking, tasks, audience metrics, profile management, and team workspaces.

## Current Architecture

Star Paper now runs on a **cloud-only runtime**:

- **Supabase Auth** is the only source of truth for sign-in, sign-out, refresh restore, and account state.
- **Supabase Postgres** is the authoritative store for bookings, expenses, other income, artists, BBF, revenue goals, closing thoughts, tasks, and profile data.
- **Browser storage is non-authoritative** and is only used for UI helpers such as theme, density, drafts, retry transport, boot context, and last-view restore.
- **Cross-browser and cross-session sync** is expected for the same account because the app always rehydrates from the cloud.

## Documentation

- [Star Paper Cloud-Only Documentation](./STAR_PAPER_DOCUMENTATION.md)
- [Cloud-Only Setup Guide](./SETUP.md)
- [Cloud-Only State Schema](./STATE_SCHEMA.md)

## Core Files

- `app.js` - UI runtime, navigation, local UI state, report helpers, profile UI, drafts, and rendering.
- `supabase.js` - auth, cloud bootstrap, sync engine, workspace resolution, structured save flows, and account/profile persistence.
- `app.reports.js` - PDF/report generation and report presentation helpers.
- `app.tasks.js` - task rendering and task interactions.
- `schema.sql` - database schema, constraints, RLS policies, and RPCs for the live Supabase project.
- `sw.js` - network-first shell caching for safe deploy refreshes.

## What "working" means now

The app is considered healthy when all of the following hold:

- A signed-out visit opens on the landing page.
- Google or email sign-in goes straight into the app shell after boot.
- Refresh while signed in keeps the user in the app and restores the last section/tab.
- Saving data persists to Supabase and reappears after refresh, re-login, or opening the same account in another browser.
- Profile updates persist through Supabase and re-render after refresh.
- Reports use cloud-backed data and BBF contributes to closing balance, not period profit.

## Deployment Rule

Always deploy the matching versions of:

- `app.js`
- `supabase.js`
- `app.reports.js`
- `app.tasks.js`
- `styles.css`
- `index.html`
- `sw.js`
- `schema.sql` when the database contract changes

If the service worker is enabled, asset version bumps in `index.html` and `sw.js` must ship together.
