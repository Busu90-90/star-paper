# Star Paper — Supabase Setup Guide
## From zero to a live, secure, cloud-backed app in ~20 minutes

---

## What you're getting after setup

- ✅ Real database — your data is saved to the cloud, never lost
- ✅ Real authentication — password-secured accounts, no plain-text storage
- ✅ Reports going back to Day 1 — unlimited history
- ✅ RLS (Row Level Security) — users only ever see their own data
- ✅ Team workspaces — share a profile with your whole management team
- ✅ Team chatroom — message board built in
- ✅ Currency switching — UGX, KES, TZS, NGN, ZAR, USD, GBP, EUR
- ✅ Automatic migration — your existing local data moves to the cloud on first login
- ✅ Offline fallback — app still works if internet drops, syncs when back online
- ✅ Free tier — 500MB database, 50,000 monthly active users, unlimited API calls

---

## Step 1: Create your Supabase project

1. Go to **[supabase.com](https://supabase.com)** and click **Start your project**
2. Sign up with GitHub (easiest) or email
3. Click **New Project**
4. Fill in:
   - **Name:** Star Paper (or anything you like)
   - **Database Password:** Create a strong password — save it somewhere safe
   - **Region:** Choose the one closest to Uganda (EU West or US East are fine)
5. Click **Create new project**
6. Wait ~2 minutes for it to spin up

---

## Step 2: Run the database schema

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New Query**
3. Open the file `schema.sql` from this package
4. Copy the entire contents and paste into the SQL editor
5. Click **Run** (or press Ctrl+Enter)
6. You should see "Success. No rows returned" — that means it worked

This creates all your tables (bookings, expenses, artists, teams, messages etc.)
and sets up Row Level Security so users only see their own data.

---

## Step 3: Get your API keys

1. In your Supabase dashboard, go to **Settings** → **API**
2. You need two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public key** — a long string starting with `eyJ...`

---

## Step 4: Add your keys to supabase.js

Open `supabase.js` and replace the two placeholder values at the top:

```javascript
// BEFORE (placeholder):
const SP_SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SP_SUPABASE_KEY = 'YOUR_ANON_PUBLIC_KEY';

// AFTER (your real values):
const SP_SUPABASE_URL = 'https://abcdefgh.supabase.co';
const SP_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

> **Security note:** The `anon` key is safe to put in frontend code — it's designed to
> be public. Row Level Security in the database enforces what each user can access.
> Never put your `service_role` key in frontend code.

---

## Step 5: Add the files to your project

Replace or add these files in your Star Paper project folder:

| File | Action |
|------|--------|
| `supabase.js` | **ADD** — new file, goes in same folder as app.js |
| `app.js` | **REPLACE** — this is the updated version with cloud sync |
| `index.html` | **REPLACE** — updated to load supabase.js before app.js |
| `schema.sql` | Keep for reference — already run in Supabase |

---

## Step 6: Enable Email Auth in Supabase

1. In Supabase dashboard → **Authentication** → **Providers**
2. Make sure **Email** is enabled (it is by default)
3. Optional: Under **Authentication** → **Templates** (or **Email Templates** in older UI),
   customize confirmation and reset email copy.

### Optional: Enable Google Login (takes 5 minutes extra)
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create OAuth credentials (Web application)
3. Add your site URL as authorized redirect URI: `https://yourproject.supabase.co/auth/v1/callback`
4. In Supabase → Authentication → Providers → Google → paste Client ID and Secret
5. Users will now see a "Sign in with Google" option

> Google OAuth setup is optional. You can launch with Email login only, then add Google later.

---

## Step 7: Test it

1. Open your app
2. Click **Get Started** → create a new account (use an email you can check)
3. Check your email for a confirmation link — click it
4. Log in with your email and password
5. Add a booking — it saves to the cloud instantly
6. Open the app in a different browser or incognito — log in again
7. Your booking is there ✅

---

## How data migration works

When you log in for the first time after the upgrade, the app automatically:
1. Detects any existing data in your browser's local storage
2. Uploads it all to Supabase in the background
3. Shows a toast: "Your local data has been securely saved to the cloud!"

You only need to do this once per browser. After that, all data comes from Supabase.

---

## Teams — How to use

### Creating a team
1. Click the **👥 Team** button in the sidebar
2. Click **+ Create Team** and give it a name (e.g. "Cindy Management")
3. Your team is created and you're the owner
4. An **Invite Code** is generated automatically (e.g. `a3f7b2c1`)

### Inviting someone
1. Share the 8-character invite code with your team member
2. They log into Star Paper, click **👥 Team** → **🔗 Join by Code**
3. They paste the code and join instantly
4. They can now see and edit your team's artists, bookings, and expenses

### Team roles
- **Owner** — full control, can remove members, only one per team
- **Manager** — can add/edit all data (bookings, expenses, artists)
- **Viewer** — read-only, great for artists checking their own schedule

### Team Chat
- Once in a team, a **Team Chat** section appears in the team panel
- Messages are live — all team members see them in real time
- Great for: "Confirmed the Kampala booking, deposit received 7M"
- Or: "Artist is running 30 mins late, let the venue know"

---

## Currency switching

1. Click the **Currency** button in the sidebar (shows current symbol e.g. UGX)
2. Select your preferred currency
3. All figures across the entire app convert instantly
4. Your preference is saved — stays the same across all your devices

**Supported currencies:**
| Code | Currency |
|------|----------|
| UGX  | Uganda Shilling (default, base) |
| KES  | Kenya Shilling |
| TZS  | Tanzania Shilling |
| NGN  | Nigerian Naira |
| ZAR  | South African Rand |
| USD  | US Dollar |
| GBP  | British Pound |
| EUR  | Euro |

> **Important:** All amounts are stored in UGX internally. Conversion happens at
> display time only. This means switching currencies never changes your data —
> it's just a display format. Exchange rates are approximate and built into the app.
> For exact rates, you can update the `SP_CURRENCIES` object in `supabase.js`.

---

## Reports going back forever

Once your data is in Supabase, it never disappears. The app's existing report
system already supports custom date ranges — you can generate a report from
any date in the past. Supabase stores everything indefinitely on the free tier
(up to 500MB, which is enormous for this type of data — you'd need to log
~50,000 bookings before coming close to the limit).

---

## Security summary

| Risk | Before | After |
|------|--------|-------|
| Data loss from browser wipe | 💀 All data lost | ✅ Safe in cloud |
| Passwords readable in DevTools | 💀 Plain text visible | ✅ Hashed by Supabase |
| One user seeing another's data | ⚠️ Possible | ✅ RLS blocks it at DB level |
| Working offline | ✅ Full app works | ✅ Still works, syncs on reconnect |
| Shared team access | ❌ Not possible | ✅ Full team workspaces |
| Reports history | ⚠️ Until browser wipe | ✅ Permanent, unlimited |

---

## Troubleshooting

**"Check your email to confirm your account"**
→ Supabase requires email confirmation by default. Open your email, click the link.
   You can disable this in Supabase → Authentication → Settings → "Confirm email".

**Login fails even after confirmation**
→ Check that your Supabase URL and anon key in supabase.js are correct. No typos.

**Data doesn't appear after login**
→ Check your browser console for errors. Look for "[StarPaper Supabase]" log lines.
   If you see auth errors, your keys may be wrong.

**Team chat doesn't update live**
→ Make sure Realtime is enabled: Supabase dashboard → Table Editor → messages table
   → click the table → check "Enable Realtime" is on.

**Migration didn't run**
→ Open browser DevTools → Application → Local Storage and check for a key like
   `sp_migrated_[userid]`. If it's not there, try logging out and back in.

---

## Free tier limits

Supabase free tier is very generous:
- 500 MB database storage
- 50,000 monthly active users  
- 1 GB file storage
- Unlimited API requests
- 2 free projects

Star Paper's typical data usage is tiny. Even with 1,000 bookings and 3 years
of history, you'd use less than 5 MB. You're not going to hit the limit.

---

*Setup complete! Your Star Paper data is now secure, cloud-backed, and team-ready.*


