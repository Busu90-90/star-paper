# Star Paper Backend (Retired)

This directory is quarantined legacy scaffolding. The current Star Paper runtime is cloud-only:

- Supabase Auth is the only supported session source.
- Supabase Postgres is the only supported business-data source.
- The frontend must not be configured to use a local backend for login.

## Remaining Endpoint

- `GET /health` returns a retired-service response for diagnostics.

## Removed Auth Path

`POST /auth/login` and all other `/auth/*` routes return `410 Gone`.

Do not set `starPaperApiBaseUrl` in browser storage. That old local-auth bridge is retired and is not part of the supported architecture.
