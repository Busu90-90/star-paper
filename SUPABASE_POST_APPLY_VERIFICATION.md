# Supabase Post-Apply Verification Runbook

This runbook proves the live Supabase project has the Star Paper hardening from `schema.sql` after the schema is applied. It does not change the runtime contract. It uses operator SQL checks in `scripts/supabase-post-apply-verification.sql` and, when production has no sample rows for active probes, `scripts/supabase-post-apply-canary-proof.sql`.

## When To Run

Run this after:

1. `scripts/supabase-migration-readiness.sql` returns no `severity = 'blocker'` rows.
2. The latest `schema.sql` has been applied in the target Supabase project.
3. The operator is ready to confirm the live database, not just the repo source.

## What It Verifies

- Invite-code invariant: `pgcrypto` is installed in the `extensions` schema, `extensions.gen_random_bytes(integer)` is available, `generate_team_invite_code()` schema-qualifies that function and returns lower-case 32-hex values, existing `teams.invite_code` values are present/unique/well-formed, malformed join codes fail closed, and browser roles cannot directly select `teams.invite_code`.
- Advisor-surface invariant: `public.ai_context` is explicitly service-role-only, browser roles have no direct table grants on it, its `user_id` foreign key has a covering index, `get_email_for_username(text)` is absent, and every browser-executable `SECURITY DEFINER` function is on the documented authenticated allowlist.
- Workspace-scope immutability invariant: the trigger-only immutability functions exist, direct execute grants are revoked, every protected table has its enabled `BEFORE UPDATE` trigger, and direct scope-changing UPDATE probes fail.
- Team-permission invariant: `team_role_permissions(role)` returns the runtime presets, `team_members.permissions` is constrained to those presets, existing rows match their roles, and a direct mismatch UPDATE probe fails.
- Rollback-contained canary invariant: disposable `teams`, `team_members`, and workspace rows can be created inside one SQL helper, forbidden reassignment and role/permission mismatch updates are blocked by the live database, and all disposable rows are rolled back before signoff evidence is returned.

## Operator Steps

1. Open the Supabase project SQL Editor for the production project.
2. Paste and run `scripts/supabase-migration-readiness.sql`.
3. Stop if any readiness row has `severity = 'blocker'`; fix the listed data issue before applying `schema.sql`.
4. Apply the latest `schema.sql` in one SQL Editor run; do not apply only the function body because the extension namespace, default execute posture, and function grants are coupled.
5. Paste and run `scripts/supabase-post-apply-verification.sql`.
6. If the base post-apply result set has active-probe warnings for `team_members` or workspace-scope triggers, paste and run `scripts/supabase-post-apply-canary-proof.sql`.
7. Save every result set with the Supabase project ref, UTC timestamp, SQL execution method, source commit or release label, and exact SQL filenames used.

## Pass Criteria

The live project is verified only when:

- `scripts/supabase-migration-readiness.sql` has no `severity = 'blocker'` rows before applying `schema.sql`.
- `scripts/supabase-post-apply-verification.sql` has no `severity = 'blocker'` rows after applying `schema.sql`.
- The post-apply output includes `invite.pgcrypto.extension_schema = pass`, `invite.pgcrypto.gen_random_bytes_namespace = pass`, `invite.generator.uses_extensions_pgcrypto = pass`, and `invite.generator.format = pass`.
- The post-apply output includes `advisor.ai_context.rls_explicit_policy = pass`, `advisor.ai_context.browser_grants_revoked = pass`, `advisor.security_definer_rpc_surface = pass`, and `advisor.username_email_lookup_absent = pass`. If `advisor.ai_context.user_id_index` is only a warning, reapply the `idx_ai_context_user_id` statement from `schema.sql` before considering the live advisor drift closed.
- If the base post-apply SQL reports helper-covered active-probe warnings, `scripts/supabase-post-apply-canary-proof.sql` has no `severity = 'blocker'` rows.
- The helper result set includes `canary.fixtures.created = pass`, the expected workspace and `team_members` block rows, the expected `permissions.canary.team_members.mismatch = pass` row, and `canary.rollback_contained = pass`.

`severity = 'warning'` in the base post-apply SQL is not a schema failure. It usually means production has no sample rows for one of the active mutation probes. Treat that as a proof gap for that specific table: the catalog trigger/constraint checks still ran, but the direct-update behavior was not exercised. For helper-covered warnings, run `scripts/supabase-post-apply-canary-proof.sql`; without that helper result set, the warning remains an unclosed proof gap.

## Stop Rules

- Any invite-code blocker means the live project can still have a wrong `pgcrypto` namespace, unresolved `extensions.gen_random_bytes(integer)`, weak/malformed/duplicated invite codes, or directly readable invite codes. Do not claim invite-code hardening is live.
- Any advisor-surface blocker means the live project still has real drift from the repo contract: either `ai_context` is not explicitly denied, username-to-email lookup exists, anonymous RPC execution remains exposed, or an unexpected `SECURITY DEFINER` function is executable by browser roles. Do not claim the Supabase advisor surface is closed.
- Any workspace immutability blocker means a crafted direct update may still move rows across personal/team workspaces. Do not claim the RLS reassignment gap is closed.
- Any team-permission blocker means direct Supabase writes may still create role/permission combinations the UI never emits. Do not claim team permissions are database-bound.
- Any canary rollback blocker means disposable proof rows may have persisted. Do not sign off until the sentinel rows named by the helper are removed or the rollback failure is understood.

## Remediation

Most blockers mean the live project did not receive the latest `schema.sql` cleanly. Reapply the relevant section or the whole schema after resolving readiness blockers, then rerun the post-apply SQL. If a blocker reports an unexpected active-probe error, inspect the named table/function/constraint before rerunning; do not mark the live migration complete from catalog checks alone.

The canary helper is not a migration and not a setup script. It performs fixture creation and active probes in the same SQL unit, then rolls back the fixtures before returning findings. Do not split fixture creation from the helper or rely on manually created UI rows for final proof. Save the helper output as evidence whenever it is used.
