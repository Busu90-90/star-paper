-- Star Paper live Supabase post-apply verification checks.
--
-- Run this in the Supabase SQL Editor after applying the latest schema.sql.
-- Persistent impact: none. The script writes only to a temporary findings table
-- in the current SQL session. Active mutation probes are wrapped in PL/pgSQL
-- exception subtransactions so successful probe updates are rolled back before
-- this script records them as failures.
--
-- PASS condition: the final result set has no severity = 'blocker' rows.
-- Warning rows usually mean the catalog is hardened but production has no
-- sample rows for an active trigger/constraint probe. Run
-- scripts/supabase-post-apply-canary-proof.sql to close team_members and
-- workspace-scope active-probe warnings without relying on production rows.

DROP TABLE IF EXISTS pg_temp.sp_post_apply_verification_findings;

CREATE TEMP TABLE sp_post_apply_verification_findings (
  check_name TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('pass', 'warning', 'blocker')),
  invariant TEXT NOT NULL,
  object_name TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  operator_action TEXT NOT NULL
);

DO $$
DECLARE
  v_bad_count INTEGER;
  v_bool BOOLEAN;
  v_error TEXT;
  v_function_def TEXT;
  v_oid OID;
  v_rel REGCLASS;
  v_rows INTEGER;
  v_sql TEXT;
  v_table TEXT;
  v_trigger_name TEXT;
  v_trigger_function TEXT;
BEGIN
  -- Invite-code invariant: codes are high-entropy, well-formed bearer tokens
  -- and the table does not disclose them directly to browser roles.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.pgcrypto.extension',
      'pass',
      'invite-code',
      'extension.pgcrypto',
      '{}'::jsonb,
      'No action.'
    );
  ELSE
    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.pgcrypto.extension',
      'blocker',
      'invite-code',
      'extension.pgcrypto',
      '{}'::jsonb,
      'Reapply schema.sql from the CREATE EXTENSION section; invite-code generation depends on gen_random_bytes.'
    );
  END IF;

  v_oid := to_regprocedure('public.generate_team_invite_code()');
  IF v_oid IS NULL THEN
    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.generator.exists',
      'blocker',
      'invite-code',
      'public.generate_team_invite_code()',
      '{}'::jsonb,
      'Reapply the invite-code function section from schema.sql.'
    );
  ELSE
    SELECT bool_and(code ~ '^[0-9a-f]{32}$')
    INTO v_bool
    FROM (
      SELECT public.generate_team_invite_code() AS code
      FROM generate_series(1, 12)
    ) generated;

    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.generator.format',
      CASE WHEN v_bool THEN 'pass' ELSE 'blocker' END,
      'invite-code',
      'public.generate_team_invite_code()',
      jsonb_build_object('sample_count', 12),
      CASE
        WHEN v_bool THEN 'No action.'
        ELSE 'Reapply schema.sql and confirm generate_team_invite_code returns lower-case 32-hex values.'
      END
    );

    IF to_regrole('anon') IS NOT NULL THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'invite.generator.anon_execute_revoked',
        CASE WHEN has_function_privilege('anon', v_oid, 'EXECUTE') THEN 'blocker' ELSE 'pass' END,
        'invite-code',
        'public.generate_team_invite_code()',
        '{}'::jsonb,
        CASE
          WHEN has_function_privilege('anon', v_oid, 'EXECUTE')
            THEN 'Reapply the REVOKE EXECUTE statements for generate_team_invite_code.'
          ELSE 'No action.'
        END
      );
    END IF;
  END IF;

  IF to_regclass('public.teams') IS NULL THEN
    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.teams.table',
      'blocker',
      'invite-code',
      'public.teams',
      '{}'::jsonb,
      'Apply schema.sql before running post-apply verification.'
    );
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teams'
      AND column_name = 'invite_code'
  ) THEN
    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.teams.invite_code_column',
      'blocker',
      'invite-code',
      'public.teams.invite_code',
      '{}'::jsonb,
      'Reapply the teams ADD COLUMN IF NOT EXISTS invite_code guard from schema.sql.'
    );
  ELSE
    SELECT count(*)::INTEGER
    INTO v_bad_count
    FROM public.teams
    WHERE invite_code IS NULL
       OR btrim(invite_code) = ''
       OR invite_code !~ '^[0-9a-f]{32}$';

    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.teams.current_rows_32_hex',
      CASE WHEN v_bad_count = 0 THEN 'pass' ELSE 'blocker' END,
      'invite-code',
      'public.teams.invite_code',
      jsonb_build_object('bad_row_count', v_bad_count),
      CASE
        WHEN v_bad_count = 0 THEN 'No action.'
        ELSE 'Reapply schema.sql so malformed or legacy invite codes rotate, then rerun this verification.'
      END
    );

    SELECT count(*)::INTEGER
    INTO v_bad_count
    FROM (
      SELECT invite_code
      FROM public.teams
      WHERE invite_code IS NOT NULL
        AND btrim(invite_code) <> ''
      GROUP BY invite_code
      HAVING count(*) > 1
    ) duplicates;

    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.teams.current_rows_unique',
      CASE WHEN v_bad_count = 0 THEN 'pass' ELSE 'blocker' END,
      'invite-code',
      'public.teams.invite_code',
      jsonb_build_object('duplicate_code_count', v_bad_count),
      CASE
        WHEN v_bad_count = 0 THEN 'No action.'
        ELSE 'Resolve duplicate invite_code values, rerun readiness, reapply schema.sql, then rerun this verification.'
      END
    );

    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.teams'::regclass
        AND conname = 'teams_invite_code_key'
        AND contype = 'u'
        AND convalidated
    )
    INTO v_bool;

    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.teams.unique_constraint',
      CASE WHEN v_bool THEN 'pass' ELSE 'blocker' END,
      'invite-code',
      'public.teams.teams_invite_code_key',
      '{}'::jsonb,
      CASE
        WHEN v_bool THEN 'No action.'
        ELSE 'Reapply the teams_invite_code_key constraint section from schema.sql.'
      END
    );

    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.teams'::regclass
        AND conname = 'teams_invite_code_format_check'
        AND contype = 'c'
        AND convalidated
        AND pg_get_constraintdef(oid) LIKE '%[0-9a-f]{32}%'
    )
    INTO v_bool;

    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.teams.format_check_constraint',
      CASE WHEN v_bool THEN 'pass' ELSE 'blocker' END,
      'invite-code',
      'public.teams.teams_invite_code_format_check',
      '{}'::jsonb,
      CASE
        WHEN v_bool THEN 'No action.'
        ELSE 'Reapply the teams_invite_code_format_check section from schema.sql.'
      END
    );

    SELECT COALESCE(pg_get_expr(d.adbin, d.adrelid), '') LIKE '%generate_team_invite_code%'
    INTO v_bool
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d
      ON d.adrelid = a.attrelid
     AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.teams'::regclass
      AND a.attname = 'invite_code'
      AND NOT a.attisdropped;

    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.teams.default_generator',
      CASE WHEN v_bool THEN 'pass' ELSE 'blocker' END,
      'invite-code',
      'public.teams.invite_code',
      '{}'::jsonb,
      CASE
        WHEN v_bool THEN 'No action.'
        ELSE 'Reapply schema.sql so new teams default to public.generate_team_invite_code().'
      END
    );

    IF to_regrole('anon') IS NULL OR to_regrole('authenticated') IS NULL THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'invite.teams.direct_select_grants',
        'warning',
        'invite-code',
        'public.teams.invite_code',
        jsonb_build_object('missing_role_check', 'anon/authenticated'),
        'Supabase roles were not visible to this session; rerun in the live Supabase project SQL Editor.'
      );
    ELSE
      v_bool :=
        NOT has_column_privilege('anon', 'public.teams', 'invite_code', 'SELECT')
        AND NOT has_column_privilege('authenticated', 'public.teams', 'invite_code', 'SELECT');

      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'invite.teams.direct_select_grants',
        CASE WHEN v_bool THEN 'pass' ELSE 'blocker' END,
        'invite-code',
        'public.teams.invite_code',
        jsonb_build_object(
          'anon_can_select', has_column_privilege('anon', 'public.teams', 'invite_code', 'SELECT'),
          'authenticated_can_select', has_column_privilege('authenticated', 'public.teams', 'invite_code', 'SELECT')
        ),
        CASE
          WHEN v_bool THEN 'No action.'
          ELSE 'Reapply the REVOKE SELECT / GRANT SELECT column-list statements for public.teams.'
        END
      );
    END IF;
  END IF;

  v_oid := to_regprocedure('public.join_team_by_code(text, uuid)');
  IF v_oid IS NULL THEN
    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.join_rpc.exists',
      'blocker',
      'invite-code',
      'public.join_team_by_code(text, uuid)',
      '{}'::jsonb,
      'Reapply the atomic team join RPC section from schema.sql.'
    );
  ELSE
    SELECT pg_get_functiondef(v_oid) INTO v_function_def;

    v_bool :=
      v_function_def LIKE '%v_invite_code !~ ''^[0-9a-f]{32}$''%'
      AND v_function_def LIKE '%''invite_code'', NULL%'
      AND v_function_def LIKE '%RAISE EXCEPTION ''Invalid invite request''%'
      AND v_function_def NOT LIKE '%Invalid invite code%';

    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.join_rpc.fail_closed_shape',
      CASE WHEN v_bool THEN 'pass' ELSE 'blocker' END,
      'invite-code',
      'public.join_team_by_code(text, uuid)',
      '{}'::jsonb,
      CASE
        WHEN v_bool THEN 'No action.'
        ELSE 'Reapply join_team_by_code from schema.sql; malformed and unknown codes must fail before lookup with the same generic error, and the RPC must not return invite_code.'
      END
    );
  END IF;

  v_oid := to_regprocedure('public.get_my_team_context(uuid)');
  IF v_oid IS NULL THEN
    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.team_context_rpc.exists',
      'blocker',
      'invite-code',
      'public.get_my_team_context(uuid)',
      '{}'::jsonb,
      'Reapply get_my_team_context from schema.sql.'
    );
  ELSE
    SELECT pg_get_functiondef(v_oid) INTO v_function_def;

    v_bool :=
      v_function_def LIKE '%THEN t.invite_code%'
      AND v_function_def LIKE '%ELSE NULL%'
      AND v_function_def LIKE '%END AS invite_code%';

    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'invite.team_context_rpc.scoped_disclosure_shape',
      CASE WHEN v_bool THEN 'pass' ELSE 'blocker' END,
      'invite-code',
      'public.get_my_team_context(uuid)',
      '{}'::jsonb,
      CASE
        WHEN v_bool THEN 'No action.'
        ELSE 'Reapply get_my_team_context from schema.sql; invite codes should only be returned by the owner/admin branch.'
      END
    );
  END IF;

  -- Workspace-scope immutability invariant: scope columns cannot be reassigned
  -- after row creation, even if a crafted direct UPDATE satisfies RLS separately.
  FOREACH v_trigger_function IN ARRAY ARRAY[
    'prevent_owner_workspace_reassignment',
    'prevent_user_workspace_reassignment',
    'prevent_team_member_reassignment'
  ]
  LOOP
    v_oid := to_regprocedure('public.' || v_trigger_function || '()');

    IF v_oid IS NULL THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.function.' || v_trigger_function,
        'blocker',
        'workspace-scope-immutability',
        'public.' || v_trigger_function || '()',
        '{}'::jsonb,
        'Reapply the workspace scope immutability function section from schema.sql.'
      );
    ELSE
      SELECT prosecdef
      INTO v_bool
      FROM pg_proc
      WHERE oid = v_oid;

      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.function.' || v_trigger_function || '.security_definer',
        CASE WHEN v_bool THEN 'pass' ELSE 'blocker' END,
        'workspace-scope-immutability',
        'public.' || v_trigger_function || '()',
        '{}'::jsonb,
        CASE
          WHEN v_bool THEN 'No action.'
          ELSE 'Reapply schema.sql; workspace trigger functions must remain SECURITY DEFINER.'
        END
      );

      IF to_regrole('anon') IS NOT NULL AND to_regrole('authenticated') IS NOT NULL THEN
        v_bool :=
          NOT has_function_privilege('anon', v_oid, 'EXECUTE')
          AND NOT has_function_privilege('authenticated', v_oid, 'EXECUTE');

        INSERT INTO sp_post_apply_verification_findings
        VALUES (
          'workspace.function.' || v_trigger_function || '.execute_revoked',
          CASE WHEN v_bool THEN 'pass' ELSE 'blocker' END,
          'workspace-scope-immutability',
          'public.' || v_trigger_function || '()',
          '{}'::jsonb,
          CASE
            WHEN v_bool THEN 'No action.'
            ELSE 'Reapply the REVOKE EXECUTE statements for workspace trigger-only functions.'
          END
        );
      END IF;
    END IF;
  END LOOP;

  FOR v_table, v_trigger_name, v_trigger_function IN
    SELECT *
    FROM (VALUES
      ('artists', 'prevent_artists_workspace_reassignment', 'prevent_owner_workspace_reassignment'),
      ('bookings', 'prevent_bookings_workspace_reassignment', 'prevent_owner_workspace_reassignment'),
      ('expenses', 'prevent_expenses_workspace_reassignment', 'prevent_owner_workspace_reassignment'),
      ('other_income', 'prevent_other_income_workspace_reassignment', 'prevent_owner_workspace_reassignment'),
      ('audience_metrics', 'prevent_audience_metrics_workspace_reassignment', 'prevent_owner_workspace_reassignment'),
      ('tasks', 'prevent_tasks_workspace_reassignment', 'prevent_user_workspace_reassignment'),
      ('revenue_goals', 'prevent_revenue_goals_workspace_reassignment', 'prevent_user_workspace_reassignment'),
      ('bbf_entries', 'prevent_bbf_entries_workspace_reassignment', 'prevent_user_workspace_reassignment'),
      ('closing_thoughts', 'prevent_closing_thoughts_workspace_reassignment', 'prevent_user_workspace_reassignment'),
      ('team_members', 'prevent_team_members_reassignment', 'prevent_team_member_reassignment')
    ) AS expected(table_name, trigger_name, function_name)
  LOOP
    v_rel := to_regclass(format('public.%I', v_table));

    IF v_rel IS NULL THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.trigger.' || v_table,
        'blocker',
        'workspace-scope-immutability',
        'public.' || v_table,
        '{}'::jsonb,
        'Apply schema.sql before running post-apply verification.'
      );
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM pg_trigger tr
      JOIN pg_proc p ON p.oid = tr.tgfoid
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE tr.tgrelid = v_rel
        AND tr.tgname = v_trigger_name
        AND NOT tr.tgisinternal
        AND tr.tgenabled <> 'D'
        AND n.nspname = 'public'
        AND p.proname = v_trigger_function
        AND (tr.tgtype & 1) = 1
        AND (tr.tgtype & 2) = 2
        AND (tr.tgtype & 16) = 16
    )
    INTO v_bool;

    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'workspace.trigger.' || v_table,
      CASE WHEN v_bool THEN 'pass' ELSE 'blocker' END,
      'workspace-scope-immutability',
      'public.' || v_table || '.' || v_trigger_name,
      jsonb_build_object('expected_function', 'public.' || v_trigger_function || '()'),
      CASE
        WHEN v_bool THEN 'No action.'
        ELSE 'Reapply the workspace trigger section from schema.sql; this table is missing an enabled BEFORE UPDATE row trigger.'
      END
    );
  END LOOP;

  FOR v_table IN
    SELECT unnest(ARRAY['artists', 'bookings', 'expenses', 'other_income', 'audience_metrics'])
  LOOP
    v_rel := to_regclass(format('public.%I', v_table));
    IF v_rel IS NULL THEN
      CONTINUE;
    END IF;

    v_error := NULL;
    v_rows := 0;
    v_sql := format($probe$
      WITH sample AS (
        SELECT id,
          CASE
            WHEN team_id IS NOT NULL THEN 'team_id'
            WHEN owner_id IS NOT NULL THEN 'owner_id'
            ELSE NULL
          END AS probe_column
        FROM public.%I
        WHERE team_id IS NOT NULL OR owner_id IS NOT NULL
        ORDER BY id
        LIMIT 1
      )
      UPDATE public.%I target
      SET
        team_id = CASE WHEN sample.probe_column = 'team_id' THEN NULL ELSE target.team_id END,
        owner_id = CASE WHEN sample.probe_column = 'owner_id' THEN NULL ELSE target.owner_id END
      FROM sample
      WHERE target.id = sample.id
    $probe$, v_table, v_table);

    BEGIN
      EXECUTE v_sql;
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows > 0 THEN
        RAISE EXCEPTION 'SP_POST_APPLY_PROBE_ROLLBACK';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
    END;

    IF v_error = 'SP_POST_APPLY_PROBE_ROLLBACK' THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.active_probe.' || v_table,
        'blocker',
        'workspace-scope-immutability',
        'public.' || v_table,
        jsonb_build_object('probe_rows', v_rows),
        'A scope-changing UPDATE unexpectedly succeeded and was rolled back by the probe. Reapply the workspace trigger section from schema.sql.'
      );
    ELSIF v_error IN ('Workspace scope cannot be changed', 'Workspace owner cannot be changed') THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.active_probe.' || v_table,
        'pass',
        'workspace-scope-immutability',
        'public.' || v_table,
        jsonb_build_object('expected_error', v_error),
        'No action.'
      );
    ELSIF v_rows = 0 THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.active_probe.' || v_table,
        'warning',
        'workspace-scope-immutability',
        'public.' || v_table,
        jsonb_build_object('sample_rows', 0),
        'No sample row existed for an active mutation probe. Catalog trigger checks still ran; run scripts/supabase-post-apply-canary-proof.sql for rollback-contained direct-update proof without relying on production rows.'
      );
    ELSE
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.active_probe.' || v_table,
        'blocker',
        'workspace-scope-immutability',
        'public.' || v_table,
        jsonb_build_object('unexpected_error', v_error),
        'The direct-update probe failed for an unexpected reason. Inspect this table trigger and rerun after resolving the error.'
      );
    END IF;
  END LOOP;

  FOR v_table IN
    SELECT unnest(ARRAY['tasks', 'revenue_goals', 'bbf_entries', 'closing_thoughts'])
  LOOP
    v_rel := to_regclass(format('public.%I', v_table));
    IF v_rel IS NULL THEN
      CONTINUE;
    END IF;

    v_error := NULL;
    v_rows := 0;
    v_sql := format($probe$
      WITH sample AS (
        SELECT id,
          CASE
            WHEN team_id IS NOT NULL THEN 'team_id'
            WHEN user_id IS NOT NULL THEN 'user_id'
            ELSE NULL
          END AS probe_column
        FROM public.%I
        WHERE team_id IS NOT NULL OR user_id IS NOT NULL
        ORDER BY id
        LIMIT 1
      )
      UPDATE public.%I target
      SET
        team_id = CASE WHEN sample.probe_column = 'team_id' THEN NULL ELSE target.team_id END,
        user_id = CASE WHEN sample.probe_column = 'user_id' THEN NULL ELSE target.user_id END
      FROM sample
      WHERE target.id = sample.id
    $probe$, v_table, v_table);

    BEGIN
      EXECUTE v_sql;
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows > 0 THEN
        RAISE EXCEPTION 'SP_POST_APPLY_PROBE_ROLLBACK';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
    END;

    IF v_error = 'SP_POST_APPLY_PROBE_ROLLBACK' THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.active_probe.' || v_table,
        'blocker',
        'workspace-scope-immutability',
        'public.' || v_table,
        jsonb_build_object('probe_rows', v_rows),
        'A scope-changing UPDATE unexpectedly succeeded and was rolled back by the probe. Reapply the workspace trigger section from schema.sql.'
      );
    ELSIF v_error IN ('Workspace scope cannot be changed', 'Workspace user cannot be changed') THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.active_probe.' || v_table,
        'pass',
        'workspace-scope-immutability',
        'public.' || v_table,
        jsonb_build_object('expected_error', v_error),
        'No action.'
      );
    ELSIF v_rows = 0 THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.active_probe.' || v_table,
        'warning',
        'workspace-scope-immutability',
        'public.' || v_table,
        jsonb_build_object('sample_rows', 0),
        'No sample row existed for an active mutation probe. Catalog trigger checks still ran; run scripts/supabase-post-apply-canary-proof.sql for rollback-contained direct-update proof without relying on production rows.'
      );
    ELSE
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.active_probe.' || v_table,
        'blocker',
        'workspace-scope-immutability',
        'public.' || v_table,
        jsonb_build_object('unexpected_error', v_error),
        'The direct-update probe failed for an unexpected reason. Inspect this table trigger and rerun after resolving the error.'
      );
    END IF;
  END LOOP;

  IF to_regclass('public.team_members') IS NOT NULL THEN
    v_error := NULL;
    v_rows := 0;

    BEGIN
      UPDATE public.team_members target
      SET team_id = NULL
      WHERE target.id = (
        SELECT id
        FROM public.team_members
        ORDER BY id
        LIMIT 1
      );
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows > 0 THEN
        RAISE EXCEPTION 'SP_POST_APPLY_PROBE_ROLLBACK';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
    END;

    IF v_error = 'SP_POST_APPLY_PROBE_ROLLBACK' THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.active_probe.team_members',
        'blocker',
        'workspace-scope-immutability',
        'public.team_members',
        jsonb_build_object('probe_rows', v_rows),
        'A team membership reassignment unexpectedly succeeded and was rolled back by the probe. Reapply the team_members trigger section from schema.sql.'
      );
    ELSIF v_error = 'Team membership cannot be moved between teams' THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.active_probe.team_members',
        'pass',
        'workspace-scope-immutability',
        'public.team_members',
        jsonb_build_object('expected_error', v_error),
        'No action.'
      );
    ELSIF v_rows = 0 THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.active_probe.team_members',
        'warning',
        'workspace-scope-immutability',
        'public.team_members',
        jsonb_build_object('sample_rows', 0),
        'No team_members row existed for an active reassignment probe. Run scripts/supabase-post-apply-canary-proof.sql for rollback-contained direct-update proof without relying on production rows or app-created teams.'
      );
    ELSE
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'workspace.active_probe.team_members',
        'blocker',
        'workspace-scope-immutability',
        'public.team_members',
        jsonb_build_object('unexpected_error', v_error),
        'The team_members reassignment probe failed for an unexpected reason. Inspect the trigger and rerun after resolving the error.'
      );
    END IF;
  END IF;

  -- Team-permission invariant: permissions are derived from role presets and
  -- direct updates cannot create impossible role/permission combinations.
  v_oid := to_regprocedure('public.team_role_permissions(text)');
  IF v_oid IS NULL THEN
    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'permissions.role_function.exists',
      'blocker',
      'team-permissions',
      'public.team_role_permissions(text)',
      '{}'::jsonb,
      'Reapply the team_role_permissions function section from schema.sql.'
    );
  ELSE
    SELECT bool_and(public.team_role_permissions(role_name) = expected_permissions)
    INTO v_bool
    FROM (VALUES
      ('owner',   '{"read":true,"edit":true,"finance":true,"reports":true,"admin":true}'::jsonb),
      ('admin',   '{"read":true,"edit":true,"finance":true,"reports":true,"admin":true}'::jsonb),
      ('manager', '{"read":true,"edit":true,"finance":false,"reports":false,"admin":false}'::jsonb),
      ('editor',  '{"read":true,"edit":true,"finance":false,"reports":false,"admin":false}'::jsonb),
      ('finance', '{"read":true,"edit":true,"finance":true,"reports":true,"admin":false}'::jsonb),
      ('reports', '{"read":true,"edit":false,"finance":false,"reports":true,"admin":false}'::jsonb),
      ('viewer',  '{"read":true,"edit":false,"finance":false,"reports":false,"admin":false}'::jsonb)
    ) AS expected(role_name, expected_permissions);

    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'permissions.role_function.presets',
      CASE WHEN v_bool THEN 'pass' ELSE 'blocker' END,
      'team-permissions',
      'public.team_role_permissions(text)',
      '{}'::jsonb,
      CASE
        WHEN v_bool THEN 'No action.'
        ELSE 'Reapply team_role_permissions from schema.sql; role presets do not match the runtime contract.'
      END
    );
  END IF;

  IF to_regclass('public.team_members') IS NULL THEN
    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'permissions.team_members.table',
      'blocker',
      'team-permissions',
      'public.team_members',
      '{}'::jsonb,
      'Apply schema.sql before running post-apply verification.'
    );
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.team_members'::regclass
        AND conname = 'team_members_permissions_match_role_check'
        AND contype = 'c'
        AND convalidated
        AND pg_get_constraintdef(oid) LIKE '%team_role_permissions(role)%'
    )
    INTO v_bool;

    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'permissions.team_members.constraint',
      CASE WHEN v_bool THEN 'pass' ELSE 'blocker' END,
      'team-permissions',
      'public.team_members.team_members_permissions_match_role_check',
      '{}'::jsonb,
      CASE
        WHEN v_bool THEN 'No action.'
        ELSE 'Reapply the team_members_permissions_match_role_check constraint section from schema.sql.'
      END
    );

    IF to_regprocedure('public.team_role_permissions(text)') IS NOT NULL THEN
      SELECT count(*)::INTEGER
      INTO v_bad_count
      FROM public.team_members
      WHERE permissions IS DISTINCT FROM public.team_role_permissions(role);

      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'permissions.team_members.current_rows_match_role',
        CASE WHEN v_bad_count = 0 THEN 'pass' ELSE 'blocker' END,
        'team-permissions',
        'public.team_members.permissions',
        jsonb_build_object('mismatched_row_count', v_bad_count),
        CASE
          WHEN v_bad_count = 0 THEN 'No action.'
          ELSE 'Reapply schema.sql to normalize permissions from role, then rerun this verification.'
        END
      );
    END IF;

    v_error := NULL;
    v_rows := 0;

    BEGIN
      UPDATE public.team_members target
      SET permissions = '{"read":false,"edit":false,"finance":false,"reports":false,"admin":false}'::jsonb
      WHERE target.id = (
        SELECT id
        FROM public.team_members
        ORDER BY id
        LIMIT 1
      );
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows > 0 THEN
        RAISE EXCEPTION 'SP_POST_APPLY_PROBE_ROLLBACK';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
    END;

    IF v_error = 'SP_POST_APPLY_PROBE_ROLLBACK' THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'permissions.active_probe.team_members',
        'blocker',
        'team-permissions',
        'public.team_members.permissions',
        jsonb_build_object('probe_rows', v_rows),
        'A role/permission mismatch UPDATE unexpectedly succeeded and was rolled back by the probe. Reapply the permissions constraint section from schema.sql.'
      );
    ELSIF v_error LIKE '%team_members_permissions_match_role_check%' THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'permissions.active_probe.team_members',
        'pass',
        'team-permissions',
        'public.team_members.permissions',
        jsonb_build_object('expected_error', v_error),
        'No action.'
      );
    ELSIF v_rows = 0 THEN
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'permissions.active_probe.team_members',
        'warning',
        'team-permissions',
        'public.team_members.permissions',
        jsonb_build_object('sample_rows', 0),
        'No team_members row existed for an active permission probe. Run scripts/supabase-post-apply-canary-proof.sql for rollback-contained direct-update proof without relying on production rows or app-created teams.'
      );
    ELSE
      INSERT INTO sp_post_apply_verification_findings
      VALUES (
        'permissions.active_probe.team_members',
        'blocker',
        'team-permissions',
        'public.team_members.permissions',
        jsonb_build_object('unexpected_error', v_error),
        'The permissions probe failed for an unexpected reason. Inspect the constraint/function and rerun after resolving the error.'
      );
    END IF;
  END IF;

  v_oid := to_regprocedure('public.has_team_permission(uuid, text)');
  IF v_oid IS NULL THEN
    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'permissions.has_team_permission.exists',
      'blocker',
      'team-permissions',
      'public.has_team_permission(uuid, text)',
      '{}'::jsonb,
      'Reapply has_team_permission from schema.sql.'
    );
  ELSE
    SELECT prosecdef
    INTO v_bool
    FROM pg_proc
    WHERE oid = v_oid;

    INSERT INTO sp_post_apply_verification_findings
    VALUES (
      'permissions.has_team_permission.security_definer',
      CASE WHEN v_bool THEN 'pass' ELSE 'blocker' END,
      'team-permissions',
      'public.has_team_permission(uuid, text)',
      '{}'::jsonb,
      CASE
        WHEN v_bool THEN 'No action.'
        ELSE 'Reapply has_team_permission from schema.sql; RLS policy checks depend on the SECURITY DEFINER helper.'
      END
    );
  END IF;
END $$;

SELECT
  check_name,
  severity,
  invariant,
  object_name,
  details,
  operator_action
FROM sp_post_apply_verification_findings
ORDER BY
  CASE severity
    WHEN 'blocker' THEN 1
    WHEN 'warning' THEN 2
    ELSE 3
  END,
  invariant,
  object_name,
  check_name;
