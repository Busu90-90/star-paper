# Star Paper Backend (Retired)

This directory is quarantined legacy scaffolding. The current Star Paper runtime is cloud-only:

- Supabase Auth is the only supported session source.
- Supabase Postgres is the only supported business-data source.
- The frontend must not be configured to use a local backend for login.

## Supported Local Preview

This directory is not a developer launch target. Use the root static frontend preview instead:

- `npm run preview`
- `npm run preview:alt` if port 8080 is already in use

Do not use `file://` as a workaround; Google OAuth and email-confirm redirects require the root `http://localhost:8080` or `http://localhost:8081` preview origin. The retired backend does not own logout/session restore; the frontend `sp_logged_out` bootstrap guard is the supported explicit-logout path.

## Diagnostics Stub

If you need to prove the retired local-auth bridge is not serving application traffic, explicitly enable the diagnostics stub and run `npm --prefix backend run diagnostics:retired-backend`.

The process refuses to start unless `SP_ENABLE_RETIRED_BACKEND_DIAGNOSTIC=1` is set.

- `GET /health` returns a retired-service response for diagnostics.
- `/auth/*` returns `410 Gone`.

## Removed Auth Path

`POST /auth/login` and all other `/auth/*` routes return `410 Gone`.

Do not set `starPaperApiBaseUrl` in browser storage. That old local-auth bridge is retired and is not part of the supported architecture.
