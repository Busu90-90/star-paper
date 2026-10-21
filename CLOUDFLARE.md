# Hosting on Cloudflare Pages

Star Paper is a static site; all data, sign-in and chat live in Supabase. Any
static host can serve it. Cloudflare Pages does it on the free plan with no
per-deploy credits (500 builds a month), and builds a preview link for every
pull request.

Netlify keeps working as before. Nothing here changes what Netlify does.

## What the repo provides

- `npm run build:cloudflare` runs preflight, then `scripts/build-cloudflare.mjs`,
  which copies only the site's files into `dist/` (the same files
  `.netlifyignore` lets through) and writes Cloudflare versions of
  `_redirects` and `_headers`.
- `wrangler.toml` tells Cloudflare the output folder is `dist`.
- `.github/workflows/supabase-keep-alive.yml` pings Supabase once a day from
  GitHub, so the free Supabase project is not paused if the Netlify keep-alive
  function stops running. GitHub turns scheduled workflows off after 60 days
  with no commits to the repo; re-enable it from the Actions tab if that happens.

## One-time setup (about 10 minutes)

1. Sign in at <https://dash.cloudflare.com> (free account).
2. Workers & Pages → Create → Pages → Connect to Git → pick `Busu90-90/star-paper`.
3. Project name `star-paper` (gives `star-paper.pages.dev` if free).
   Production branch `main`. Framework preset: None.
   Build command `npm run build:cloudflare`. Output directory `dist`.
4. Save and deploy.
5. In Supabase → Authentication → URL Configuration, add to Redirect URLs:
   - `https://star-paper.pages.dev/**`
   - `https://*.star-paper.pages.dev/**` (pull request previews)
   Google sign-in goes through Supabase, so Google Cloud needs no change.
6. Sign in on the new address and check the app loads your data.

## Things to know

- Each web address keeps its own browser storage. On the new address people
  sign in once more; their data comes back from Supabase. Anything saved
  offline on the old address and not yet synced stays on the old address, so
  open the old site once while online before switching.
- `star-paper.netlify.app` stays up with the last version Netlify deployed.
  Once the move is settled it can be turned into a redirect to the new address.
- A few places still name `star-paper.netlify.app` as the "home" address
  (PDF footer, share image, Sentry's production label, the email-link
  fallback in `supabase.js`). They keep working; change them when the new
  address is final.
