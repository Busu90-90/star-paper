# Star Paper Cloud-Only Setup Guide

This guide matches the current Star Paper architecture.

## 1. What Star Paper expects

Star Paper is no longer a dual-mode app. It does **not** treat browser-local business data or browser-local auth as the source of truth.

Production setup assumes:

- Supabase Auth is enabled and correctly configured.
- Supabase Postgres contains the current `schema.sql`.
- The deployed site URL and redirect URLs are correctly configured in Supabase Auth.
- Users load their data from the cloud on every valid session restore.

## 2. Create or open your Supabase project

1. Create a Supabase project.
2. Save the project URL and anon key.
3. Use a region close to your users when possible.

## 3. Run the database schema

1. Open the Supabase SQL Editor.
2. Open `schema.sql` from this repo.
3. Paste and run it in the SQL Editor.

This step is mandatory because Star Paper depends on:

- tables for bookings, expenses, other income, artists, BBF, revenue goals, closing thoughts, audience metrics, tasks, teams, team members, and messages
- profile storage for avatar, username, phone, bio, email mirror, and workspace preference
- RLS policies that protect personal and team workspaces
- the unique constraints used by cloud upserts for legacy-origin records

## 4. Verify the live schema contract

Before shipping, confirm the live project has the current constraints and policies for:

- `bookings`
- `expenses`
- `other_income`
- `artists`
- `profiles`
- `team_members`
- `messages`

Critical expectations:

- UUID primary keys where the frontend expects cloud IDs
- owner-scoped and team-scoped RLS
- personal workspace inserts and reads for authenticated owners
- valid upsert constraints such as `legacy_id, owner_id` where the runtime uses them

## 5. Put your Supabase keys in `supabase.js`

Replace the placeholder project URL and anon key with real values.

Important:

- The anon key is safe for frontend use.
- Never put a service-role key in the browser.

## 6. Configure Supabase Auth

### Required

- Enable Email auth if you want email/password accounts.
- Add the deployed site URL.
- Add every redirect URL used in development and production.

### Recommended

- Keep email confirmation enabled for production.
- Configure a custom SMTP provider if you need higher email throughput than the default limits.

## 7. Configure Google sign-in

If you use Google auth:

1. Create Google OAuth credentials for a web application.
2. Add Supabase's callback URL in Google Cloud.
3. Enable Google in Supabase Auth and paste the client ID and secret.
4. Confirm the deployed site URL and callback flow are both allowed.

## 8. Realtime and sync behavior

Star Paper relies on cloud rehydration plus refresh/focus/interval/realtime updates.

Make sure:

- the app can read and write the cloud tables it needs
- Realtime is enabled where your collaboration flow depends on it
- team users have correct RLS for shared records

## 9. Browser storage policy

Browser storage is allowed only for:

- theme
- density
- sidebar collapsed state
- boot context
- last-view restore
- form drafts
- account-scoped retry transport state
- push configuration and similar device-specific UI settings

Browser storage is **not** authoritative for:

- sessions
- profile truth
- bookings
- expenses
- other income
- artists
- tasks
- reports
- BBF

## 10. Deployment checklist

Deploy these files together:

- `app.js`
- `supabase.js`
- `app.reports.js`
- `app.tasks.js`
- `styles.css`
- `index.html`
- `sw.js`

Also deploy or run:

- `schema.sql` when backend changes are part of the release

If you changed any cached asset version:

- update the matching references in `index.html`
- update the cache list and cache name in `sw.js`

## 11. Manual verification before release

### Auth

- Signed-out first visit opens on landing.
- Google or email sign-in enters the app shell successfully.
- Sign-out returns to login or landing as intended.
- Refresh while signed in restores the app instead of logging the user out.

### Persistence

- Create a booking, expense, and other income entry.
- Refresh and confirm they are still present.
- Log out and sign back in and confirm they rehydrate.

### Cross-browser sync

- Open the same account in a second browser.
- Confirm the same records appear after refresh or after the normal sync cycle.

### Profile

- Update username, phone, bio, and avatar.
- Refresh and sign back in.
- Confirm the same profile state is still rendered.

### Reports

- Generate a report with non-zero BBF.
- Confirm BBF is shown as opening balance.
- Confirm closing balance uses `BBF + income + other income - expenses`.

## 12. Troubleshooting

### Signed in but stuck on boot

Check:

- `supabase.js` startup flow
- boot context handling
- service worker cache freshness
- live Supabase availability

### Data saved but missing after refresh

Check:

- the cloud save result for the exact failing step
- the live schema and RLS
- whether the save reached Supabase successfully

### Google sign-in returns but user does not enter the app

Check:

- Supabase redirect URLs
- Google callback configuration
- service worker freshness
- auth callback handling in `supabase.js`

### Email account creation is rate-limited

That is usually a Supabase Auth email limit issue. Use custom SMTP or wait for the rate limit window to reset.
