-- Star Paper rollback-contained canary proof for post-apply Supabase checks.
--
-- Run this in the Supabase SQL Editor after schema.sql and
-- scripts/supabase-post-apply-verification.sql. This helper closes the active
-- probe proof gap when production has no team_members or workspace rows to
-- mutate. It creates disposable canary rows, performs the forbidden updates,
-- records the observed database errors in a temporary findings table, then
-- deliberately rolls the canary writes back before returning results.
--
-- Persistent impact: none expected. The only rows outside the rollback block are
-- temporary findings in the current SQL session.
--
-- PASS condition: the final result set has no severity = 'blocker' rows and
-- includes canary.rollback_contained = pass.

DROP TABLE IF EXISTS pg_temp.sp_post_apply_canary_findings;

CREATE TEMP TABLE sp_post_apply_canary_findings (
  check_name TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('pass', 'blocker')),
  invariant TEXT NOT NULL,
  object_name TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  operator_action TEXT NOT NULL
);

DO $$
DECLARE
  v_actor_id UUID;
  v_artist_id UUID;
  v_auth_email TEXT;
  v_auth_user_source TEXT := 'existing';
  v_canary_period TEXT;
  v_canary_task_id TEXT;
  v_canary_token TEXT;
  v_error TEXT;
  v_findings JSONB := '[]'::jsonb;
  v_primary_team_id UUID;
  v_remaining_count INTEGER := 0;
  v_rollback_completed BOOLEAN := false;
  v_rows INTEGER := 0;
  v_secondary_team_id UUID;
  v_sql TEXT;
  v_table TEXT;
  v_team_member_id UUID;
  v_unexpected_error TEXT;
BEGIN
  v_canary_token := 'sp_post_apply_canary_' || replace(gen_random_uuid()::TEXT, '-', '');
  v_canary_task_id := v_canary_token || '_task';
  v_canary_period := 'sp-canary-' || right(v_canary_token, 16);
  v_auth_email := v_canary_token || '@example.invalid';

  BEGIN
    IF to_regclass('auth.users') IS NULL THEN
      RAISE EXCEPTION 'auth.users table is missing';
    END IF;

    SELECT id
    INTO v_actor_id
    FROM auth.users
    ORDER BY created_at NULLS LAST, id
    LIMIT 1;

    IF v_actor_id IS NULL THEN
      v_actor_id := gen_random_uuid();
      v_auth_user_source := 'rollback_created';

      INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      )
      VALUES (
        v_actor_id,
        '00000000-0000-0000-0000-000000000000'::UUID,
        'authenticated',
        'authenticated',
        v_auth_email,
        '',
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('username', v_canary_token),
        now(),
        now()
      );
    END IF;

    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'check_name', 'canary.actor.available',
      'severity', 'pass',
      'invariant', 'rollback-contained-canary',
      'object_name', 'auth.users',
      'details', jsonb_build_object('auth_user_source', v_auth_user_source),
      'operator_action', 'No action.'
    ));

    INSERT INTO public.teams (name, owner_id)
    VALUES ('SP post-apply canary primary ' || v_canary_token, v_actor_id)
    RETURNING id INTO v_primary_team_id;

    INSERT INTO public.teams (name, owner_id)
    VALUES ('SP post-apply canary secondary ' || v_canary_token, v_actor_id)
    RETURNING id INTO v_secondary_team_id;

    INSERT INTO public.team_members (team_id, user_id, role, permissions)
    VALUES (
      v_primary_team_id,
      v_actor_id,
      'owner',
      public.team_role_permissions('owner')
    )
    RETURNING id INTO v_team_member_id;

    INSERT INTO public.artists (legacy_id, owner_id, team_id, name)
    VALUES (
      v_canary_token,
      v_actor_id,
      v_primary_team_id,
      'SP post-apply canary artist'
    )
    RETURNING id INTO v_artist_id;

    INSERT INTO public.bookings (
      legacy_id,
      owner_id,
      team_id,
      artist_id,
      artist_name,
      event,
      date
    )
    VALUES (
      v_canary_token,
      v_actor_id,
      v_primary_team_id,
      v_artist_id,
      'SP post-apply canary artist',
      'SP post-apply canary booking',
      current_date
    );

    INSERT INTO public.expenses (
      legacy_id,
      owner_id,
      team_id,
      artist_id,
      artist_name,
      description,
      amount,
      date
    )
    VALUES (
      v_canary_token,
      v_actor_id,
      v_primary_team_id,
      v_artist_id,
      'SP post-apply canary artist',
      'SP post-apply canary expense',
      1,
      current_date
    );

    INSERT INTO public.other_income (
      legacy_id,
      owner_id,
      team_id,
      artist_id,
      artist_name,
      source,
      amount,
      date
    )
    VALUES (
      v_canary_token,
      v_actor_id,
      v_primary_team_id,
      v_artist_id,
      'SP post-apply canary artist',
      'SP post-apply canary income',
      1,
      current_date
    );

    INSERT INTO public.audience_metrics (
      legacy_id,
      owner_id,
      team_id,
      artist_id,
      artist_name,
      period
    )
    VALUES (
      v_canary_token,
      v_actor_id,
      v_primary_team_id,
      v_artist_id,
      'SP post-apply canary artist',
      v_canary_period
    );

    INSERT INTO public.tasks (id, user_id, team_id, text)
    VALUES (
      v_canary_task_id,
      v_actor_id,
      v_primary_team_id,
      'SP post-apply canary task'
    );

    INSERT INTO public.revenue_goals (user_id, team_id, amount, period)
    VALUES (v_actor_id, v_primary_team_id, 1, v_canary_period);

    INSERT INTO public.bbf_entries (user_id, team_id, period, amount)
    VALUES (v_actor_id, v_primary_team_id, v_canary_period, 1);

    INSERT INTO public.closing_thoughts (user_id, team_id, period, content)
    VALUES (
      v_actor_id,
      v_primary_team_id,
      v_canary_period,
      'SP post-apply canary closing thought'
    );

    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'check_name', 'canary.fixtures.created',
      'severity', 'pass',
      'invariant', 'rollback-contained-canary',
      'object_name', 'public.*',
      'details', jsonb_build_object(
        'team_members_rows', 1,
        'owner_scope_rows', 5,
        'user_scope_rows', 4
      ),
      'operator_action', 'No action.'
    ));

    FOR v_table IN
      SELECT unnest(ARRAY[
        'artists',
        'bookings',
        'expenses',
        'other_income',
        'audience_metrics'
      ])
    LOOP
      v_error := NULL;
      v_rows := 0;
      v_sql := format(
        'UPDATE public.%I SET team_id = $1 WHERE legacy_id = $2',
        v_table
      );

      BEGIN
        EXECUTE v_sql USING v_secondary_team_id, v_canary_token;
        GET DIAGNOSTICS v_rows = ROW_COUNT;

        IF v_rows > 0 THEN
          RAISE EXCEPTION 'SP_POST_APPLY_PROBE_ROLLBACK';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
      END;

      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'check_name', 'workspace.canary.' || v_table || '.team_scope',
        'severity',
          CASE WHEN v_error = 'Workspace scope cannot be changed'
            THEN 'pass'
            ELSE 'blocker'
          END,
        'invariant', 'workspace-scope-immutability',
        'object_name', 'public.' || v_table,
        'details',
          CASE WHEN v_error = 'Workspace scope cannot be changed'
            THEN jsonb_build_object('expected_error', v_error)
            ELSE jsonb_build_object(
              'unexpected_error', v_error,
              'probe_rows', v_rows
            )
          END,
        'operator_action',
          CASE WHEN v_error = 'Workspace scope cannot be changed'
            THEN 'No action.'
            ELSE 'The rollback-contained canary reassignment was not blocked by the expected workspace trigger. Reapply the workspace trigger section from schema.sql.'
          END
      ));
    END LOOP;

    FOR v_table IN
      SELECT unnest(ARRAY[
        'artists',
        'bookings',
        'expenses',
        'other_income',
        'audience_metrics'
      ])
    LOOP
      v_error := NULL;
      v_rows := 0;
      v_sql := format(
        'UPDATE public.%I SET owner_id = NULL WHERE legacy_id = $1',
        v_table
      );

      BEGIN
        EXECUTE v_sql USING v_canary_token;
        GET DIAGNOSTICS v_rows = ROW_COUNT;

        IF v_rows > 0 THEN
          RAISE EXCEPTION 'SP_POST_APPLY_PROBE_ROLLBACK';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
      END;

      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'check_name', 'workspace.canary.' || v_table || '.owner_scope',
        'severity',
          CASE WHEN v_error = 'Workspace owner cannot be changed'
            THEN 'pass'
            ELSE 'blocker'
          END,
        'invariant', 'workspace-scope-immutability',
        'object_name', 'public.' || v_table,
        'details',
          CASE WHEN v_error = 'Workspace owner cannot be changed'
            THEN jsonb_build_object('expected_error', v_error)
            ELSE jsonb_build_object(
              'unexpected_error', v_error,
              'probe_rows', v_rows
            )
          END,
        'operator_action',
          CASE WHEN v_error = 'Workspace owner cannot be changed'
            THEN 'No action.'
            ELSE 'The owner_id reassignment canary was not blocked by the expected workspace trigger. Reapply prevent_owner_workspace_reassignment from schema.sql.'
          END
      ));
    END LOOP;

    v_error := NULL;
    v_rows := 0;
    BEGIN
      UPDATE public.tasks
      SET team_id = v_secondary_team_id
      WHERE id = v_canary_task_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows > 0 THEN
        RAISE EXCEPTION 'SP_POST_APPLY_PROBE_ROLLBACK';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
    END;

    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'check_name', 'workspace.canary.tasks.team_scope',
      'severity',
        CASE WHEN v_error = 'Workspace scope cannot be changed'
          THEN 'pass'
          ELSE 'blocker'
        END,
      'invariant', 'workspace-scope-immutability',
      'object_name', 'public.tasks',
      'details',
        CASE WHEN v_error = 'Workspace scope cannot be changed'
          THEN jsonb_build_object('expected_error', v_error)
          ELSE jsonb_build_object('unexpected_error', v_error, 'probe_rows', v_rows)
        END,
      'operator_action',
        CASE WHEN v_error = 'Workspace scope cannot be changed'
          THEN 'No action.'
          ELSE 'The task team_id reassignment canary was not blocked by the expected workspace trigger. Reapply prevent_tasks_workspace_reassignment from schema.sql.'
        END
    ));

    v_error := NULL;
    v_rows := 0;
    BEGIN
      UPDATE public.tasks
      SET user_id = NULL
      WHERE id = v_canary_task_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows > 0 THEN
        RAISE EXCEPTION 'SP_POST_APPLY_PROBE_ROLLBACK';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
    END;

    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'check_name', 'workspace.canary.tasks.user_scope',
      'severity',
        CASE WHEN v_error = 'Workspace user cannot be changed'
          THEN 'pass'
          ELSE 'blocker'
        END,
      'invariant', 'workspace-scope-immutability',
      'object_name', 'public.tasks',
      'details',
        CASE WHEN v_error = 'Workspace user cannot be changed'
          THEN jsonb_build_object('expected_error', v_error)
          ELSE jsonb_build_object('unexpected_error', v_error, 'probe_rows', v_rows)
        END,
      'operator_action',
        CASE WHEN v_error = 'Workspace user cannot be changed'
          THEN 'No action.'
          ELSE 'The task user_id reassignment canary was not blocked by the expected workspace trigger. Reapply prevent_user_workspace_reassignment from schema.sql.'
        END
    ));

    FOR v_table IN
      SELECT unnest(ARRAY[
        'revenue_goals',
        'bbf_entries',
        'closing_thoughts'
      ])
    LOOP
      v_error := NULL;
      v_rows := 0;
      v_sql := format(
        'UPDATE public.%I SET team_id = $1 WHERE team_id = $2 AND period = $3',
        v_table
      );

      BEGIN
        EXECUTE v_sql USING v_secondary_team_id, v_primary_team_id, v_canary_period;
        GET DIAGNOSTICS v_rows = ROW_COUNT;

        IF v_rows > 0 THEN
          RAISE EXCEPTION 'SP_POST_APPLY_PROBE_ROLLBACK';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
      END;

      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'check_name', 'workspace.canary.' || v_table || '.team_scope',
        'severity',
          CASE WHEN v_error = 'Workspace scope cannot be changed'
            THEN 'pass'
            ELSE 'blocker'
          END,
        'invariant', 'workspace-scope-immutability',
        'object_name', 'public.' || v_table,
        'details',
          CASE WHEN v_error = 'Workspace scope cannot be changed'
            THEN jsonb_build_object('expected_error', v_error)
            ELSE jsonb_build_object(
              'unexpected_error', v_error,
              'probe_rows', v_rows
            )
          END,
        'operator_action',
          CASE WHEN v_error = 'Workspace scope cannot be changed'
            THEN 'No action.'
            ELSE 'The rollback-contained canary reassignment was not blocked by the expected workspace trigger. Reapply the workspace trigger section from schema.sql.'
          END
      ));
    END LOOP;

    FOR v_table IN
      SELECT unnest(ARRAY[
        'revenue_goals',
        'bbf_entries',
        'closing_thoughts'
      ])
    LOOP
      v_error := NULL;
      v_rows := 0;
      v_sql := format(
        'UPDATE public.%I SET user_id = NULL WHERE team_id = $1 AND period = $2',
        v_table
      );

      BEGIN
        EXECUTE v_sql USING v_primary_team_id, v_canary_period;
        GET DIAGNOSTICS v_rows = ROW_COUNT;

        IF v_rows > 0 THEN
          RAISE EXCEPTION 'SP_POST_APPLY_PROBE_ROLLBACK';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
      END;

      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'check_name', 'workspace.canary.' || v_table || '.user_scope',
        'severity',
          CASE WHEN v_error = 'Workspace user cannot be changed'
            THEN 'pass'
            ELSE 'blocker'
          END,
        'invariant', 'workspace-scope-immutability',
        'object_name', 'public.' || v_table,
        'details',
          CASE WHEN v_error = 'Workspace user cannot be changed'
            THEN jsonb_build_object('expected_error', v_error)
            ELSE jsonb_build_object(
              'unexpected_error', v_error,
              'probe_rows', v_rows
            )
          END,
        'operator_action',
          CASE WHEN v_error = 'Workspace user cannot be changed'
            THEN 'No action.'
            ELSE 'The user_id reassignment canary was not blocked by the expected workspace trigger. Reapply prevent_user_workspace_reassignment from schema.sql.'
          END
      ));
    END LOOP;

    v_error := NULL;
    v_rows := 0;
    BEGIN
      UPDATE public.team_members
      SET team_id = v_secondary_team_id
      WHERE id = v_team_member_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows > 0 THEN
        RAISE EXCEPTION 'SP_POST_APPLY_PROBE_ROLLBACK';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
    END;

    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'check_name', 'workspace.canary.team_members.team_scope',
      'severity',
        CASE WHEN v_error = 'Team membership cannot be moved between teams'
          THEN 'pass'
          ELSE 'blocker'
        END,
      'invariant', 'workspace-scope-immutability',
      'object_name', 'public.team_members',
      'details',
        CASE WHEN v_error = 'Team membership cannot be moved between teams'
          THEN jsonb_build_object('expected_error', v_error)
          ELSE jsonb_build_object('unexpected_error', v_error, 'probe_rows', v_rows)
        END,
      'operator_action',
        CASE WHEN v_error = 'Team membership cannot be moved between teams'
          THEN 'No action.'
          ELSE 'The team_members team_id reassignment canary was not blocked by the expected trigger. Reapply prevent_team_members_reassignment from schema.sql.'
        END
    ));

    v_error := NULL;
    v_rows := 0;
    BEGIN
      UPDATE public.team_members
      SET user_id = NULL
      WHERE id = v_team_member_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows > 0 THEN
        RAISE EXCEPTION 'SP_POST_APPLY_PROBE_ROLLBACK';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
    END;

    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'check_name', 'workspace.canary.team_members.user_scope',
      'severity',
        CASE WHEN v_error = 'Team membership cannot be moved between users'
          THEN 'pass'
          ELSE 'blocker'
        END,
      'invariant', 'workspace-scope-immutability',
      'object_name', 'public.team_members',
      'details',
        CASE WHEN v_error = 'Team membership cannot be moved between users'
          THEN jsonb_build_object('expected_error', v_error)
          ELSE jsonb_build_object('unexpected_error', v_error, 'probe_rows', v_rows)
        END,
      'operator_action',
        CASE WHEN v_error = 'Team membership cannot be moved between users'
          THEN 'No action.'
          ELSE 'The team_members user_id reassignment canary was not blocked by the expected trigger. Reapply prevent_team_members_reassignment from schema.sql.'
        END
    ));

    v_error := NULL;
    v_rows := 0;
    BEGIN
      UPDATE public.team_members
      SET permissions = '{"read":false,"edit":false,"finance":false,"reports":false,"admin":false}'::jsonb
      WHERE id = v_team_member_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows > 0 THEN
        RAISE EXCEPTION 'SP_POST_APPLY_PROBE_ROLLBACK';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
    END;

    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'check_name', 'permissions.canary.team_members.mismatch',
      'severity',
        CASE WHEN v_error LIKE '%team_members_permissions_match_role_check%'
          THEN 'pass'
          ELSE 'blocker'
        END,
      'invariant', 'team-permissions',
      'object_name', 'public.team_members.permissions',
      'details',
        CASE WHEN v_error LIKE '%team_members_permissions_match_role_check%'
          THEN jsonb_build_object('expected_error', v_error)
          ELSE jsonb_build_object('unexpected_error', v_error, 'probe_rows', v_rows)
        END,
      'operator_action',
        CASE WHEN v_error LIKE '%team_members_permissions_match_role_check%'
          THEN 'No action.'
          ELSE 'The team_members permissions mismatch canary was not blocked by the expected check constraint. Reapply the permissions constraint section from schema.sql.'
        END
    ));

    RAISE EXCEPTION 'SP_POST_APPLY_CANARY_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    v_unexpected_error := SQLERRM;

    IF v_unexpected_error = 'SP_POST_APPLY_CANARY_ROLLBACK' THEN
      v_rollback_completed := true;
    ELSE
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'check_name', 'canary.setup',
        'severity', 'blocker',
        'invariant', 'rollback-contained-canary',
        'object_name', 'public.*',
        'details', jsonb_build_object(
          'unexpected_error', v_unexpected_error,
          'canary_token', v_canary_token
        ),
        'operator_action', 'The helper could not create rollback-contained canary rows. Confirm schema.sql was applied cleanly, then rerun this helper.'
      ));
    END IF;
  END;

  IF v_rollback_completed THEN
    BEGIN
      SELECT
        (
          SELECT count(*) FROM auth.users
          WHERE email = v_auth_email
        ) +
        (
          SELECT count(*) FROM public.teams
          WHERE name IN (
            'SP post-apply canary primary ' || v_canary_token,
            'SP post-apply canary secondary ' || v_canary_token
          )
        ) +
        (
          SELECT count(*) FROM public.team_members
          WHERE id = v_team_member_id
        ) +
        (
          SELECT count(*) FROM public.artists
          WHERE legacy_id = v_canary_token
        ) +
        (
          SELECT count(*) FROM public.bookings
          WHERE legacy_id = v_canary_token
        ) +
        (
          SELECT count(*) FROM public.expenses
          WHERE legacy_id = v_canary_token
        ) +
        (
          SELECT count(*) FROM public.other_income
          WHERE legacy_id = v_canary_token
        ) +
        (
          SELECT count(*) FROM public.audience_metrics
          WHERE legacy_id = v_canary_token
        ) +
        (
          SELECT count(*) FROM public.tasks
          WHERE id = v_canary_task_id
        ) +
        (
          SELECT count(*) FROM public.revenue_goals
          WHERE team_id = v_primary_team_id
            AND period = v_canary_period
        ) +
        (
          SELECT count(*) FROM public.bbf_entries
          WHERE team_id = v_primary_team_id
            AND period = v_canary_period
        ) +
        (
          SELECT count(*) FROM public.closing_thoughts
          WHERE team_id = v_primary_team_id
            AND period = v_canary_period
        )
      INTO v_remaining_count;

      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'check_name', 'canary.rollback_contained',
        'severity',
          CASE WHEN v_remaining_count = 0 THEN 'pass' ELSE 'blocker' END,
        'invariant', 'rollback-contained-canary',
        'object_name', 'public.*',
        'details', jsonb_build_object(
          'canary_token', v_canary_token,
          'remaining_sentinel_rows', v_remaining_count
        ),
        'operator_action',
          CASE WHEN v_remaining_count = 0
            THEN 'No action.'
            ELSE 'Canary sentinel rows remained after the rollback proof. Remove the sentinel rows before signoff and inspect the helper execution.'
          END
      ));
    EXCEPTION WHEN OTHERS THEN
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'check_name', 'canary.rollback_contained',
        'severity', 'blocker',
        'invariant', 'rollback-contained-canary',
        'object_name', 'public.*',
        'details', jsonb_build_object(
          'unexpected_error', SQLERRM,
          'canary_token', v_canary_token
        ),
        'operator_action', 'The helper could not verify that canary rows were rolled back. Inspect the named sentinel token before signoff.'
      ));
    END;
  END IF;

  INSERT INTO sp_post_apply_canary_findings (
    check_name,
    severity,
    invariant,
    object_name,
    details,
    operator_action
  )
  SELECT
    findings.check_name,
    findings.severity,
    findings.invariant,
    findings.object_name,
    coalesce(findings.details, '{}'::jsonb),
    findings.operator_action
  FROM jsonb_to_recordset(v_findings) AS findings(
    check_name TEXT,
    severity TEXT,
    invariant TEXT,
    object_name TEXT,
    details JSONB,
    operator_action TEXT
  );
END $$;

SELECT
  check_name,
  severity,
  invariant,
  object_name,
  details,
  operator_action
FROM sp_post_apply_canary_findings
ORDER BY
  CASE severity
    WHEN 'blocker' THEN 1
    ELSE 2
  END,
  invariant,
  object_name,
  check_name;
