-- Star Paper live Supabase migration readiness checks.
--
-- Run this in the Supabase SQL Editor before applying the latest schema.sql
-- constraint hardening. After schema.sql is applied, run
-- scripts/supabase-post-apply-verification.sql against the same project; if
-- active-probe warnings remain for team_members or workspace triggers, run
-- scripts/supabase-post-apply-canary-proof.sql and save that result set too.
-- Persistent impact: none. The script writes only to a temporary table in the
-- current SQL session, then returns the findings.
--
-- PASS condition: the final result set has no severity = 'blocker' rows.

DROP TABLE IF EXISTS pg_temp.sp_migration_readiness_findings;

CREATE TEMP TABLE sp_migration_readiness_findings (
  check_name TEXT NOT NULL,
  severity TEXT NOT NULL,
  relation_name TEXT NOT NULL,
  scope_kind TEXT,
  scope_id TEXT,
  duplicate_key TEXT,
  duplicate_count INTEGER,
  row_ids UUID[],
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  remediation TEXT NOT NULL
);

DO $$
DECLARE
  v_table TEXT;
  v_sql TEXT;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    INSERT INTO sp_migration_readiness_findings (
      check_name, severity, relation_name, details, remediation
    )
    VALUES (
      'profiles.table',
      'blocker',
      'public.profiles',
      '{"missing": "table"}'::jsonb,
      'Apply the table creation/upgrade section from schema.sql before enforcing profile constraints.'
    );
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'username'
  ) THEN
    INSERT INTO sp_migration_readiness_findings (
      check_name, severity, relation_name, details, remediation
    )
    VALUES (
      'profiles.username.column',
      'blocker',
      'public.profiles',
      '{"missing": "username"}'::jsonb,
      'Apply the profiles ADD COLUMN IF NOT EXISTS username guard from schema.sql before enforcing profiles_username_key.'
    );
  ELSE
    INSERT INTO sp_migration_readiness_findings (
      check_name,
      severity,
      relation_name,
      scope_kind,
      scope_id,
      duplicate_key,
      duplicate_count,
      row_ids,
      details,
      remediation
    )
    SELECT
      'profiles.username.unique',
      'blocker',
      'public.profiles',
      'global',
      NULL,
      username,
      COUNT(*)::INTEGER,
      ARRAY_AGG(id ORDER BY id),
      jsonb_build_object('constraint', 'profiles_username_key'),
      'Resolve duplicate public.profiles.username values, then rerun this readiness script before applying schema.sql.'
    FROM public.profiles
    WHERE username IS NOT NULL
      AND btrim(username) <> ''
    GROUP BY username
    HAVING COUNT(*) > 1;

    INSERT INTO sp_migration_readiness_findings (
      check_name,
      severity,
      relation_name,
      scope_kind,
      scope_id,
      duplicate_key,
      duplicate_count,
      row_ids,
      details,
      remediation
    )
    SELECT
      'profiles.username.normalized',
      'warning',
      'public.profiles',
      'global',
      NULL,
      lower(username),
      COUNT(*)::INTEGER,
      ARRAY_AGG(id ORDER BY id),
      jsonb_build_object('runtime_check', 'is_username_available lower(username)'),
      'These rows do not block profiles_username_key unless the raw username is identical, but the runtime treats case variants as unavailable.'
    FROM public.profiles
    WHERE username IS NOT NULL
      AND btrim(username) <> ''
    GROUP BY lower(username)
    HAVING COUNT(DISTINCT username) > 1;
  END IF;

  IF to_regclass('public.ai_context') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      LEFT JOIN pg_policy pol ON pol.polrelid = c.oid
      WHERE c.oid = 'public.ai_context'::regclass
      GROUP BY c.oid, c.relrowsecurity
      HAVING c.relrowsecurity AND COUNT(pol.oid) = 0
    ) THEN
      INSERT INTO sp_migration_readiness_findings (
        check_name, severity, relation_name, details, remediation
      )
      VALUES (
        'ai_context.rls_policy',
        'warning',
        'public.ai_context',
        '{"rls_enabled": true, "policy_count": 0}'::jsonb,
        'Apply schema.sql to install the explicit deny policy for browser roles, then rerun post-apply verification.'
      );
    END IF;

    IF to_regrole('anon') IS NOT NULL
      AND to_regrole('authenticated') IS NOT NULL
      AND (
        has_table_privilege('anon', 'public.ai_context', 'SELECT')
        OR has_table_privilege('anon', 'public.ai_context', 'INSERT')
        OR has_table_privilege('anon', 'public.ai_context', 'UPDATE')
        OR has_table_privilege('anon', 'public.ai_context', 'DELETE')
        OR has_table_privilege('authenticated', 'public.ai_context', 'SELECT')
        OR has_table_privilege('authenticated', 'public.ai_context', 'INSERT')
        OR has_table_privilege('authenticated', 'public.ai_context', 'UPDATE')
        OR has_table_privilege('authenticated', 'public.ai_context', 'DELETE')
      )
    THEN
      INSERT INTO sp_migration_readiness_findings (
        check_name, severity, relation_name, details, remediation
      )
      VALUES (
        'ai_context.browser_table_grants',
        'warning',
        'public.ai_context',
        jsonb_build_object(
          'anon', jsonb_build_object(
            'select', has_table_privilege('anon', 'public.ai_context', 'SELECT'),
            'insert', has_table_privilege('anon', 'public.ai_context', 'INSERT'),
            'update', has_table_privilege('anon', 'public.ai_context', 'UPDATE'),
            'delete', has_table_privilege('anon', 'public.ai_context', 'DELETE')
          ),
          'authenticated', jsonb_build_object(
            'select', has_table_privilege('authenticated', 'public.ai_context', 'SELECT'),
            'insert', has_table_privilege('authenticated', 'public.ai_context', 'INSERT'),
            'update', has_table_privilege('authenticated', 'public.ai_context', 'UPDATE'),
            'delete', has_table_privilege('authenticated', 'public.ai_context', 'DELETE')
          )
        ),
        'Apply schema.sql to revoke direct browser-role table privileges from public.ai_context.'
      );
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = 'public.ai_context'::regclass
        AND attname = 'user_id'
        AND NOT attisdropped
    )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = 'public.ai_context'::regclass
          AND i.indkey::int2[] @> ARRAY[(
            SELECT attnum
            FROM pg_attribute
            WHERE attrelid = 'public.ai_context'::regclass
              AND attname = 'user_id'
              AND NOT attisdropped
          )]::int2[]
      )
    THEN
      INSERT INTO sp_migration_readiness_findings (
        check_name, severity, relation_name, details, remediation
      )
      VALUES (
        'ai_context.user_id_index',
        'warning',
        'public.ai_context',
        '{"missing_index": "idx_ai_context_user_id"}'::jsonb,
        'Apply schema.sql to install idx_ai_context_user_id and close the foreign-key advisor drift.'
      );
    END IF;
  END IF;

  IF to_regclass('public.teams') IS NULL THEN
    INSERT INTO sp_migration_readiness_findings (
      check_name, severity, relation_name, details, remediation
    )
    VALUES (
      'teams.table',
      'blocker',
      'public.teams',
      '{"missing": "table"}'::jsonb,
      'Apply the table creation/upgrade section from schema.sql before enforcing team invite-code constraints.'
    );
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teams'
      AND column_name = 'invite_code'
  ) THEN
    INSERT INTO sp_migration_readiness_findings (
      check_name, severity, relation_name, details, remediation
    )
    VALUES (
      'teams.invite_code.column',
      'blocker',
      'public.teams',
      '{"missing": "invite_code"}'::jsonb,
      'Apply the teams ADD COLUMN IF NOT EXISTS invite_code guard from schema.sql before enforcing teams_invite_code_key.'
    );
  ELSE
    INSERT INTO sp_migration_readiness_findings (
      check_name,
      severity,
      relation_name,
      scope_kind,
      scope_id,
      duplicate_key,
      duplicate_count,
      row_ids,
      details,
      remediation
    )
    SELECT
      'teams.invite_code.unique',
      'blocker',
      'public.teams',
      'global',
      NULL,
      invite_code,
      COUNT(*)::INTEGER,
      ARRAY_AGG(id ORDER BY id),
      jsonb_build_object('constraint', 'teams_invite_code_key'),
      'Regenerate or otherwise resolve duplicate nonblank public.teams.invite_code values, then rerun this readiness script before applying schema.sql.'
    FROM public.teams
    WHERE invite_code IS NOT NULL
      AND btrim(invite_code) <> ''
      AND invite_code ~ '^[0-9a-f]{32}$'
    GROUP BY invite_code
    HAVING COUNT(*) > 1;
  END IF;

  FOREACH v_table IN ARRAY ARRAY['bookings', 'expenses', 'other_income', 'artists']
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      INSERT INTO sp_migration_readiness_findings (
        check_name, severity, relation_name, details, remediation
      )
      VALUES (
        v_table || '.table',
        'blocker',
        'public.' || v_table,
        '{"missing": "table"}'::jsonb,
        'Apply the table creation/upgrade section from schema.sql before enforcing scoped legacy_id indexes.'
      );
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = 'legacy_id'
    ) THEN
      INSERT INTO sp_migration_readiness_findings (
        check_name, severity, relation_name, details, remediation
      )
      VALUES (
        v_table || '.legacy_id.column',
        'blocker',
        'public.' || v_table,
        '{"missing": "legacy_id"}'::jsonb,
        'Apply the ADD COLUMN IF NOT EXISTS legacy_id guard from schema.sql before enforcing scoped legacy_id indexes.'
      );
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = 'team_id'
    ) THEN
      INSERT INTO sp_migration_readiness_findings (
        check_name, severity, relation_name, details, remediation
      )
      VALUES (
        v_table || '.team_id.column',
        'blocker',
        'public.' || v_table,
        '{"missing": "team_id"}'::jsonb,
        'Apply the ADD COLUMN IF NOT EXISTS team_id guard from schema.sql before enforcing scoped legacy_id indexes.'
      );
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = 'owner_id'
    ) THEN
      INSERT INTO sp_migration_readiness_findings (
        check_name, severity, relation_name, details, remediation
      )
      VALUES (
        v_table || '.owner_id.column',
        'blocker',
        'public.' || v_table,
        '{"missing": "owner_id"}'::jsonb,
        'Apply the table creation/upgrade section from schema.sql before enforcing personal scoped legacy_id indexes.'
      );
      CONTINUE;
    END IF;

    v_sql := format($fmt$
      INSERT INTO sp_migration_readiness_findings (
        check_name,
        severity,
        relation_name,
        scope_kind,
        scope_id,
        duplicate_key,
        duplicate_count,
        row_ids,
        details,
        remediation
      )
      SELECT
        %L,
        'blocker',
        %L,
        'personal',
        owner_id::TEXT,
        COALESCE(NULLIF(legacy_id, ''), '<blank>'),
        COUNT(*)::INTEGER,
        ARRAY_AGG(id ORDER BY id),
        jsonb_build_object('index', %L, 'raw_legacy_id', legacy_id),
        %L
      FROM %I.%I
      WHERE team_id IS NULL
        AND owner_id IS NOT NULL
        AND legacy_id IS NOT NULL
      GROUP BY owner_id, legacy_id
      HAVING COUNT(*) > 1
    $fmt$,
      v_table || '.legacy_id.personal_unique',
      'public.' || v_table,
      v_table || '_legacy_id_owner_personal_idx',
      'Resolve duplicate legacy_id values inside the same personal owner workspace, then rerun this readiness script before applying schema.sql.',
      'public',
      v_table
    );
    EXECUTE v_sql;

    v_sql := format($fmt$
      INSERT INTO sp_migration_readiness_findings (
        check_name,
        severity,
        relation_name,
        scope_kind,
        scope_id,
        duplicate_key,
        duplicate_count,
        row_ids,
        details,
        remediation
      )
      SELECT
        %L,
        'blocker',
        %L,
        'team',
        team_id::TEXT,
        COALESCE(NULLIF(legacy_id, ''), '<blank>'),
        COUNT(*)::INTEGER,
        ARRAY_AGG(id ORDER BY id),
        jsonb_build_object('index', %L, 'raw_legacy_id', legacy_id),
        %L
      FROM %I.%I
      WHERE team_id IS NOT NULL
        AND legacy_id IS NOT NULL
      GROUP BY team_id, legacy_id
      HAVING COUNT(*) > 1
    $fmt$,
      v_table || '.legacy_id.team_unique',
      'public.' || v_table,
      v_table || '_legacy_id_team_idx',
      'Resolve duplicate legacy_id values inside the same team workspace, then rerun this readiness script before applying schema.sql.',
      'public',
      v_table
    );
    EXECUTE v_sql;
  END LOOP;
END $$;

SELECT
  check_name,
  severity,
  relation_name,
  scope_kind,
  scope_id,
  duplicate_key,
  duplicate_count,
  row_ids,
  details,
  remediation
FROM sp_migration_readiness_findings
ORDER BY
  CASE severity
    WHEN 'blocker' THEN 1
    WHEN 'warning' THEN 2
    ELSE 3
  END,
  relation_name,
  check_name,
  scope_kind,
  scope_id,
  duplicate_key;
