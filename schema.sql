-- ============================================================
-- STAR PAPER â€” SUPABASE DATABASE SCHEMA
-- Run this entire file in your Supabase SQL Editor
-- Dashboard â†’ SQL Editor â†’ New Query â†’ Paste â†’ Run
-- ============================================================

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- High-entropy invite codes use pgcrypto's CSPRNG. Supabase projects normally
-- install extensions under the extensions schema; schema-qualify calls from
-- functions with fixed search_path values.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- New functions should not become publicly executable by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rls_auto_enable'
      AND pg_get_function_arguments(p.oid) = ''
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ============================================================
-- PROFILES (extends auth.users â€” one row per user)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     TEXT UNIQUE NOT NULL,
  email        TEXT,
  phone        TEXT,
  bio          TEXT DEFAULT '',
  avatar       TEXT DEFAULT '',
  preferred_currency TEXT DEFAULT 'UGX',
  preferred_theme TEXT DEFAULT 'dark',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_theme TEXT DEFAULT 'dark';
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_currency TEXT DEFAULT 'UGX';
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT '';
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.profiles
SET username = lower('user_' || substr(replace(id::TEXT, '-', ''), 1, 12))
WHERE username IS NULL OR trim(username) = '';

ALTER TABLE public.profiles
  ALTER COLUMN username SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);
  END IF;
END $$;

-- ============================================================
-- AI CONTEXT (service-role only)
-- ============================================================
-- Residual AI instruction state is not part of the browser runtime. Keep the
-- table explicit in the schema so live advisor checks do not rely on an
-- accidental "RLS enabled with no policies" fail-closed state.
CREATE TABLE IF NOT EXISTS public.ai_context (
  user_id           UUID REFERENCES auth.users(id),
  instruction_key   TEXT PRIMARY KEY,
  instruction_value TEXT,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_context ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ai_context_user_id
  ON public.ai_context (user_id);

REVOKE ALL ON TABLE public.ai_context FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Browser roles cannot access AI context" ON public.ai_context;
CREATE POLICY "Browser roles cannot access AI context"
  ON public.ai_context FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_base_username TEXT;
  v_username TEXT;
BEGIN
  v_base_username := lower(
    regexp_replace(
      COALESCE(
        NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
        split_part(COALESCE(NEW.email, 'user'), '@', 1),
        'user'
      ),
      '[^a-zA-Z0-9_]+',
      '_',
      'g'
    )
  );
  v_base_username := trim(both '_' from v_base_username);
  IF v_base_username = '' THEN
    v_base_username := 'user';
  END IF;

  v_username := v_base_username;
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = lower(v_username)
  ) THEN
    v_username := left(v_base_username, 40) || '_' || substr(replace(NEW.id::text, '-', ''), 1, 6);
  END IF;

  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    v_username,
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger-only function; it should not be callable through the public REST RPC API.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- USERNAME HELPERS (signup + login)
-- ============================================================
-- Check username availability without exposing full profiles.
CREATE OR REPLACE FUNCTION public.is_username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(username) = lower(p_username)
  );
$$;

-- Email lookup by username is intentionally disabled client-side. It leaks
-- account existence and email addresses to anonymous callers.
DROP FUNCTION IF EXISTS public.get_email_for_username(TEXT);

-- Username availability is authenticated-only. Signup correctness is enforced
-- by handle_new_user() and profiles_username_key rather than by an anonymous
-- account-enumeration RPC.
REVOKE EXECUTE ON FUNCTION public.is_username_available(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_username_available(TEXT) TO authenticated;

-- Team invite codes are public bearer tokens. Keep them long, random, and
-- lower-case URL-safe so a leaked or guessed code is the only join path.
CREATE OR REPLACE FUNCTION public.generate_team_invite_code()
RETURNS TEXT
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT encode(extensions.gen_random_bytes(16), 'hex');
$$;

REVOKE EXECUTE ON FUNCTION public.generate_team_invite_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_team_invite_code() TO authenticated;

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code  TEXT UNIQUE DEFAULT public.generate_team_invite_code(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS invite_code TEXT;
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.teams
SET invite_code = public.generate_team_invite_code()
WHERE invite_code IS NULL
   OR trim(invite_code) = ''
   OR invite_code !~ '^[0-9a-f]{32}$';

ALTER TABLE public.teams
  ALTER COLUMN invite_code SET DEFAULT public.generate_team_invite_code();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teams_invite_code_key'
  ) THEN
    ALTER TABLE public.teams ADD CONSTRAINT teams_invite_code_key UNIQUE (invite_code);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teams_invite_code_format_check'
  ) THEN
    ALTER TABLE public.teams
      ADD CONSTRAINT teams_invite_code_format_check
      CHECK (invite_code ~ '^[0-9a-f]{32}$');
  END IF;
END $$;

-- Invite codes are bearer tokens. Direct table reads only expose non-secret team
-- metadata; admin-visible invite codes are returned through SECURITY DEFINER RPCs.
REVOKE SELECT ON public.teams FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, name, owner_id, created_at) ON public.teams TO authenticated;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (lower(username));

CREATE INDEX IF NOT EXISTS idx_profiles_last_active_team_id
  ON public.profiles(last_active_team_id);

-- ============================================================
-- TEAM MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'manager', 'editor', 'finance', 'reports', 'viewer')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.team_members
  ALTER COLUMN role SET DEFAULT 'viewer';

ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_role_check;

ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'editor', 'finance', 'reports', 'viewer'));

UPDATE public.team_members
SET role = 'editor'
WHERE role = 'manager';

CREATE OR REPLACE FUNCTION public.team_role_permissions(p_role TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE lower(coalesce(p_role, 'viewer'))
    WHEN 'owner' THEN '{"read":true,"edit":true,"finance":true,"reports":true,"admin":true}'::jsonb
    WHEN 'admin' THEN '{"read":true,"edit":true,"finance":true,"reports":true,"admin":true}'::jsonb
    WHEN 'manager' THEN '{"read":true,"edit":true,"finance":false,"reports":false,"admin":false}'::jsonb
    WHEN 'editor' THEN '{"read":true,"edit":true,"finance":false,"reports":false,"admin":false}'::jsonb
    WHEN 'finance' THEN '{"read":true,"edit":true,"finance":true,"reports":true,"admin":false}'::jsonb
    WHEN 'reports' THEN '{"read":true,"edit":false,"finance":false,"reports":true,"admin":false}'::jsonb
    ELSE '{"read":true,"edit":false,"finance":false,"reports":false,"admin":false}'::jsonb
  END;
$$;

UPDATE public.team_members
SET permissions = public.team_role_permissions(role)
WHERE permissions IS DISTINCT FROM public.team_role_permissions(role);

ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_permissions_match_role_check;

ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_permissions_match_role_check
  CHECK (permissions = public.team_role_permissions(role));

CREATE OR REPLACE FUNCTION public.has_team_permission(p_team_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = auth.uid()
      AND (
        tm.role IN ('owner', 'admin')
        OR lower(coalesce(p_permission, 'read')) = 'read'
        OR coalesce((tm.permissions ->> lower(p_permission))::BOOLEAN, false)
        OR (
          lower(coalesce(p_permission, '')) = 'edit'
          AND tm.role IN ('manager', 'editor', 'finance')
        )
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.team_role_permissions(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_team_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_role_permissions(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_team_permission(UUID, TEXT) TO authenticated;

-- SECURITY DEFINER helper: returns all team_ids the given user belongs to.
-- Executes with elevated privileges so it bypasses RLS on the inner lookup,
-- preventing the infinite recursion that happens when the SELECT policy on
-- team_members references team_members itself.
CREATE OR REPLACE FUNCTION public.get_my_team_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT team_id
  FROM public.team_members
  WHERE user_id = auth.uid()
    AND uid = auth.uid();
$$;

-- Grant to authenticated users so the policy can call it
REVOKE EXECUTE ON FUNCTION public.get_my_team_ids(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_team_ids(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.getmyteamids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT * FROM public.get_my_team_ids(uid);
$$;

-- Legacy alias retained for catalog compatibility only; it is not part of the
-- browser RPC surface and should not be executable through PostgREST.
REVOKE EXECUTE ON FUNCTION public.getmyteamids(UUID) FROM PUBLIC, anon, authenticated;

-- â”€â”€ ATOMIC TEAM CREATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Creates a team AND adds the creator as owner in a single transaction.
-- Using one RPC call = one Supabase auth-lock acquisition instead of two,
-- which eliminates the "AbortError: Lock broken by steal" race condition.
-- Fast team context for the app Team modal. This avoids recursive/slow RLS joins
-- by returning the current user's teams and role metadata from one SECURITY DEFINER RPC.
CREATE OR REPLACE FUNCTION public.get_my_team_context(uid UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  invite_code TEXT,
  owner_id UUID,
  my_role TEXT,
  my_permissions JSONB
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    t.id,
    t.name,
    CASE
      WHEN tm.role IN ('owner', 'admin')
        OR COALESCE(tm.permissions, public.team_role_permissions(tm.role)) @> '{"admin": true}'::jsonb
      THEN t.invite_code
      ELSE NULL
    END AS invite_code,
    t.owner_id,
    tm.role AS my_role,
    COALESCE(tm.permissions, public.team_role_permissions(tm.role)) AS my_permissions
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.user_id = auth.uid()
    AND uid = auth.uid()
  ORDER BY t.created_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_team_context(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_team_context(UUID) TO authenticated;

-- One-call authenticated bootstrap payload for deterministic login/refresh first paint.
-- The client treats this RPC as the authoritative loader-blocking snapshot; broader
-- table sync belongs after the app shell is visible.
CREATE OR REPLACE FUNCTION public.get_bootstrap_payload(uid UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_profile JSONB := NULL;
  v_profile_team_id UUID := NULL;
  v_team_id UUID := NULL;
  v_team_role TEXT := NULL;
  v_team_permissions JSONB := NULL;
  v_teams JSONB := '[]'::jsonb;
  v_workspace JSONB;
  v_can_read_finance BOOLEAN := FALSE;
  v_bookings JSONB := '[]'::jsonb;
  v_expenses JSONB := '[]'::jsonb;
  v_other_income JSONB := '[]'::jsonb;
  v_artists JSONB := '[]'::jsonb;
  v_audience_metrics JSONB := '[]'::jsonb;
  v_tasks JSONB := '[]'::jsonb;
  v_revenue_goals JSONB := '[]'::jsonb;
  v_bbf_entries JSONB := '[]'::jsonb;
  v_closing_thoughts JSONB := '[]'::jsonb;
BEGIN
  IF v_actor IS NULL OR uid IS NULL OR uid <> v_actor THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT to_jsonb(p), p.last_active_team_id
  INTO v_profile, v_profile_team_id
  FROM public.profiles p
  WHERE p.id = v_actor;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'invite_code', CASE
        WHEN tm.role IN ('owner', 'admin')
          OR COALESCE(tm.permissions, public.team_role_permissions(tm.role)) @> '{"admin": true}'::jsonb
        THEN t.invite_code
        ELSE NULL
      END,
      'owner_id', t.owner_id,
      'my_role', tm.role,
      'my_permissions', COALESCE(tm.permissions, public.team_role_permissions(tm.role))
    )
    ORDER BY t.created_at ASC
  ), '[]'::jsonb)
  INTO v_teams
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.user_id = v_actor;

  IF v_profile_team_id IS NOT NULL THEN
    SELECT tm.team_id, tm.role, COALESCE(tm.permissions, public.team_role_permissions(tm.role))
    INTO v_team_id, v_team_role, v_team_permissions
    FROM public.team_members tm
    WHERE tm.user_id = v_actor
      AND tm.team_id = v_profile_team_id
    LIMIT 1;
  END IF;

  v_can_read_finance := v_team_id IS NULL
    OR public.has_team_permission(v_team_id, 'finance')
    OR public.has_team_permission(v_team_id, 'reports');

  SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC), '[]'::jsonb)
  INTO v_bookings
  FROM public.bookings b
  WHERE (
    v_team_id IS NULL
    AND b.owner_id = v_actor
    AND b.team_id IS NULL
  ) OR (
    v_team_id IS NOT NULL
    AND b.team_id = v_team_id
  );

  IF v_can_read_finance THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.date DESC NULLS LAST), '[]'::jsonb)
    INTO v_expenses
    FROM public.expenses e
    WHERE (
      v_team_id IS NULL
      AND e.owner_id = v_actor
      AND e.team_id IS NULL
    ) OR (
      v_team_id IS NOT NULL
      AND e.team_id = v_team_id
    );

    SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.date DESC NULLS LAST), '[]'::jsonb)
    INTO v_other_income
    FROM public.other_income oi
    WHERE (
      v_team_id IS NULL
      AND oi.owner_id = v_actor
      AND oi.team_id IS NULL
    ) OR (
      v_team_id IS NOT NULL
      AND oi.team_id = v_team_id
    );

    SELECT COALESCE(jsonb_agg(to_jsonb(rg)), '[]'::jsonb)
    INTO v_revenue_goals
    FROM public.revenue_goals rg
    WHERE rg.period = 'monthly'
      AND (
        (
          v_team_id IS NULL
          AND rg.user_id = v_actor
          AND rg.team_id IS NULL
        ) OR (
          v_team_id IS NOT NULL
          AND rg.team_id = v_team_id
        )
      );

    SELECT COALESCE(jsonb_agg(to_jsonb(bbf) ORDER BY bbf.period ASC), '[]'::jsonb)
    INTO v_bbf_entries
    FROM public.bbf_entries bbf
    WHERE (
      v_team_id IS NULL
      AND bbf.user_id = v_actor
      AND bbf.team_id IS NULL
    ) OR (
      v_team_id IS NOT NULL
      AND bbf.team_id = v_team_id
    );
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.name ASC), '[]'::jsonb)
  INTO v_artists
  FROM public.artists a
  WHERE (
    v_team_id IS NULL
    AND a.owner_id = v_actor
    AND a.team_id IS NULL
  ) OR (
    v_team_id IS NOT NULL
    AND a.team_id = v_team_id
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(am) ORDER BY am.period DESC), '[]'::jsonb)
  INTO v_audience_metrics
  FROM public.audience_metrics am
  WHERE (
    v_team_id IS NULL
    AND am.owner_id = v_actor
    AND am.team_id IS NULL
  ) OR (
    v_team_id IS NOT NULL
    AND am.team_id = v_team_id
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(tk) ORDER BY tk.created_at ASC), '[]'::jsonb)
  INTO v_tasks
  FROM public.tasks tk
  WHERE (
    v_team_id IS NULL
    AND tk.user_id = v_actor
    AND tk.team_id IS NULL
  ) OR (
    v_team_id IS NOT NULL
    AND tk.team_id = v_team_id
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(ct) ORDER BY ct.updated_at ASC), '[]'::jsonb)
  INTO v_closing_thoughts
  FROM public.closing_thoughts ct
  WHERE (
    v_team_id IS NULL
    AND ct.user_id = v_actor
    AND ct.team_id IS NULL
  ) OR (
    v_team_id IS NOT NULL
    AND ct.team_id = v_team_id
  );

  v_workspace := jsonb_build_object(
    'ownerId', v_actor,
    'teamId', v_team_id,
    'scopeKey', COALESCE('team:' || v_team_id::text, v_actor::text),
    'source', CASE WHEN v_team_id IS NULL THEN 'personal' ELSE 'profile' END,
    'role', v_team_role,
    'permissions', v_team_permissions
  );

  RETURN jsonb_build_object(
    'profile', v_profile,
    'teams', v_teams,
    'workspace', v_workspace,
    'data', jsonb_build_object(
      'bookings', v_bookings,
      'expenses', v_expenses,
      'otherIncome', v_other_income,
      'artists', v_artists,
      'audienceMetrics', v_audience_metrics,
      'tasks', v_tasks,
      'revenueGoal', COALESCE(v_revenue_goals->0, NULL),
      'bbfEntries', v_bbf_entries,
      'closingThoughts', v_closing_thoughts
    ),
    'meta', jsonb_build_object(
      'source', 'get_bootstrap_payload',
      'complete', TRUE,
      'firstPaintKeys', jsonb_build_array('bookings', 'expenses', 'otherIncome', 'artists'),
      'backgroundKeys', jsonb_build_array('audienceMetrics', 'tasks', 'revenueGoal', 'bbfEntries', 'closingThoughts'),
      'missingKeys', '[]'::jsonb,
      'generatedAt', now()
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_bootstrap_payload(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bootstrap_payload(UUID) TO authenticated;

-- Fast member roster for the active team. The caller only receives members for
-- teams they belong to; admins can still manage members through the existing RLS policies.
CREATE OR REPLACE FUNCTION public.get_team_members_context(p_team_id UUID)
RETURNS TABLE (
  user_id UUID,
  role TEXT,
  permissions JSONB,
  joined_at TIMESTAMPTZ,
  profile_id UUID,
  username TEXT,
  email TEXT,
  avatar TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    tm.user_id,
    tm.role,
    COALESCE(tm.permissions, public.team_role_permissions(tm.role)) AS permissions,
    tm.joined_at,
    p.id AS profile_id,
    p.username,
    CASE
      WHEN tm.user_id = auth.uid()
        OR public.has_team_permission(p_team_id, 'admin')
      THEN p.email
      ELSE NULL
    END AS email,
    p.avatar
  FROM public.team_members tm
  LEFT JOIN public.profiles p ON p.id = tm.user_id
  WHERE tm.team_id = p_team_id
    AND EXISTS (
      SELECT 1
      FROM public.team_members mine
      WHERE mine.team_id = p_team_id
        AND mine.user_id = auth.uid()
    )
  ORDER BY tm.joined_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_team_members_context(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_members_context(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_team_with_member(
  p_name     TEXT,
  p_owner_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_team public.teams;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_owner_id IS NOT NULL AND p_owner_id <> v_actor THEN
    RAISE EXCEPTION 'Cannot create a team for another user';
  END IF;

  IF NULLIF(trim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Team name is required';
  END IF;

  -- Insert the team
  INSERT INTO public.teams (name, owner_id)
  VALUES (trim(p_name), v_actor)
  RETURNING * INTO v_team;

  -- Insert creator as owner member in the same transaction
  INSERT INTO public.team_members (team_id, user_id, role, permissions)
  VALUES (v_team.id, v_actor, 'owner', public.team_role_permissions('owner'))
  ON CONFLICT (team_id, user_id) DO UPDATE
    SET role = 'owner',
        permissions = public.team_role_permissions('owner');

  RETURN row_to_json(v_team);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_team_with_member(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_with_member(TEXT, UUID) TO authenticated;

-- â”€â”€ ATOMIC TEAM JOIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Looks up a team by invite code and inserts the member row in one transaction.
-- Replaces two sequential SELECT + INSERT calls, eliminating the lock contention
-- that caused "AbortError: Lock broken by steal" during the join flow.
-- Returns the team row as JSON, or raises a generic exception if the join fails.
CREATE OR REPLACE FUNCTION public.join_team_by_code(
  p_invite_code TEXT,
  p_user_id     UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_team public.teams;
  v_invite_code TEXT;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> v_actor THEN
    RAISE EXCEPTION 'Invalid invite request';
  END IF;

  v_invite_code := lower(trim(coalesce(p_invite_code, '')));
  IF v_invite_code !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'Invalid invite request';
  END IF;

  -- Look up team by a high-entropy invite code; short legacy codes fail closed.
  SELECT * INTO v_team
  FROM public.teams
  WHERE invite_code = v_invite_code;

  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite request';
  END IF;

  -- Insert member (ignore duplicate â€” already a member is fine)
  INSERT INTO public.team_members (team_id, user_id, role, permissions)
  VALUES (v_team.id, v_actor, 'viewer', public.team_role_permissions('viewer'))
  ON CONFLICT (team_id, user_id) DO NOTHING;

  RETURN json_build_object(
    'id', v_team.id,
    'name', v_team.name,
    'invite_code', NULL,
    'owner_id', v_team.owner_id,
    'created_at', v_team.created_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_team_by_code(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_team_by_code(TEXT, UUID) TO authenticated;

DROP POLICY IF EXISTS "Team members can view other team members" ON public.team_members;
CREATE POLICY "Team members can view other team members"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (
    team_id IN (SELECT public.get_my_team_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Team owners can manage members" ON public.team_members;
DROP POLICY IF EXISTS "Team owners can update members" ON public.team_members;
DROP POLICY IF EXISTS "Team owners can delete members" ON public.team_members;
-- Split the old FOR ALL into UPDATE and DELETE only.
-- A FOR ALL policy applies its USING clause to SELECT as well, causing a second
-- cross-table RLS evaluation on every team_members SELECT â€” this is what causes
-- the 8-second timeout for non-owner members. Limiting to UPDATE+DELETE means
-- the expensive EXISTS(FROM teams ...) check only runs when actually needed.
CREATE POLICY "Team owners can update members"
  ON public.team_members FOR UPDATE
  TO authenticated
  USING (
    team_members.role <> 'owner'
    AND public.has_team_permission(team_members.team_id, 'admin')
  )
  WITH CHECK (
    team_members.role <> 'owner'
    AND public.has_team_permission(team_members.team_id, 'admin')
  );

CREATE POLICY "Team owners can delete members"
  ON public.team_members FOR DELETE
  TO authenticated
  USING (
    team_members.role <> 'owner'
    AND public.has_team_permission(team_members.team_id, 'admin')
  );

DROP POLICY IF EXISTS "Users can join teams (insert themselves)" ON public.team_members;
-- Direct self-join is intentionally disabled. Users must join teams through
-- public.join_team_by_code(), which validates the invite code before inserting.

DROP POLICY IF EXISTS "Team members can view their teams" ON public.teams;
CREATE POLICY "Team members can view their teams"
  ON public.teams FOR SELECT
  TO authenticated
  USING (
    auth.uid() = owner_id OR
    id IN (SELECT public.get_my_team_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Only owner can update team" ON public.teams;
CREATE POLICY "Only owner can update team"
  ON public.teams FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
CREATE POLICY "Authenticated users can create teams"
  ON public.teams FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

-- ============================================================
-- ARTISTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.artists (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legacy_id    TEXT,  -- stores old local ID for migration
  owner_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id      UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT DEFAULT '',
  phone        TEXT DEFAULT '',
  specialty    TEXT DEFAULT '',
  bio          TEXT DEFAULT '',
  strategic_goal TEXT DEFAULT '',
  avatar       TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS legacy_id TEXT;
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS strategic_goal TEXT DEFAULT '';
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT '';
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP POLICY IF EXISTS "Users can read artists" ON public.artists;
CREATE POLICY "Users can read artists"
  ON public.artists FOR SELECT
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = artists.team_id
        AND team_members.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Managers can insert artists" ON public.artists;
CREATE POLICY "Managers can insert artists"
  ON public.artists FOR INSERT
  TO authenticated
  WITH CHECK (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND owner_id = auth.uid() AND public.has_team_permission(artists.team_id, 'edit'))
  );

DROP POLICY IF EXISTS "Managers can update artists" ON public.artists;
CREATE POLICY "Managers can update artists"
  ON public.artists FOR UPDATE
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(artists.team_id, 'edit'))
  )
  WITH CHECK (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND owner_id = auth.uid() AND public.has_team_permission(artists.team_id, 'edit'))
  );

DROP POLICY IF EXISTS "Managers can delete artists" ON public.artists;
CREATE POLICY "Managers can delete artists"
  ON public.artists FOR DELETE
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(artists.team_id, 'edit'))
  );

-- ============================================================
-- BOOKINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bookings (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legacy_id      TEXT,  -- stores old numeric/local ID for migration
  owner_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id        UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  artist_id      UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  artist_name    TEXT NOT NULL DEFAULT '',
  event          TEXT NOT NULL,
  date           DATE,
  capacity       INTEGER DEFAULT 0,
  fee            NUMERIC DEFAULT 0,
  deposit        NUMERIC DEFAULT 0,
  balance        NUMERIC DEFAULT 0,
  contact        TEXT DEFAULT '',
  status         TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed')),
  notes          TEXT DEFAULT '',
  location_type  TEXT DEFAULT 'uganda',
  location       TEXT DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS legacy_id TEXT;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS artist_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 0;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS location_type TEXT DEFAULT 'uganda';
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP POLICY IF EXISTS "Users can read bookings" ON public.bookings;
CREATE POLICY "Users can read bookings"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = bookings.team_id
        AND team_members.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Managers can insert bookings" ON public.bookings;
CREATE POLICY "Managers can insert bookings"
  ON public.bookings FOR INSERT
  TO authenticated
  WITH CHECK (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND owner_id = auth.uid() AND public.has_team_permission(bookings.team_id, 'edit'))
  );

DROP POLICY IF EXISTS "Managers can update bookings" ON public.bookings;
CREATE POLICY "Managers can update bookings"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(bookings.team_id, 'edit'))
  )
  WITH CHECK (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND owner_id = auth.uid() AND public.has_team_permission(bookings.team_id, 'edit'))
  );

DROP POLICY IF EXISTS "Managers can delete bookings" ON public.bookings;
CREATE POLICY "Managers can delete bookings"
  ON public.bookings FOR DELETE
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(bookings.team_id, 'edit'))
  );

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legacy_id   TEXT,
  owner_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  artist_id   UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  artist_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  amount      NUMERIC DEFAULT 0,
  date        DATE,
  category    TEXT DEFAULT 'other',
  receipt     TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS legacy_id TEXT;
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL;
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS artist_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP POLICY IF EXISTS "Users can read expenses" ON public.expenses;
CREATE POLICY "Users can read expenses"
  ON public.expenses FOR SELECT
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND (
      public.has_team_permission(expenses.team_id, 'finance') OR
      public.has_team_permission(expenses.team_id, 'reports')
    ))
  );

DROP POLICY IF EXISTS "Managers can insert expenses" ON public.expenses;
CREATE POLICY "Managers can insert expenses"
  ON public.expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND owner_id = auth.uid() AND public.has_team_permission(expenses.team_id, 'finance'))
  );

DROP POLICY IF EXISTS "Managers can update expenses" ON public.expenses;
CREATE POLICY "Managers can update expenses"
  ON public.expenses FOR UPDATE
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(expenses.team_id, 'finance'))
  )
  WITH CHECK (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND owner_id = auth.uid() AND public.has_team_permission(expenses.team_id, 'finance'))
  );

DROP POLICY IF EXISTS "Managers can delete expenses" ON public.expenses;
CREATE POLICY "Managers can delete expenses"
  ON public.expenses FOR DELETE
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(expenses.team_id, 'finance'))
  );

-- ============================================================
-- OTHER INCOME
-- ============================================================
CREATE TABLE IF NOT EXISTS public.other_income (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legacy_id   TEXT,
  owner_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  artist_id   UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  artist_name TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL,
  amount      NUMERIC DEFAULT 0,
  date        DATE,
  type        TEXT DEFAULT 'tips',
  payer       TEXT DEFAULT '',
  method      TEXT DEFAULT 'cash',
  status      TEXT DEFAULT 'received',
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.other_income ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.other_income
  ADD COLUMN IF NOT EXISTS legacy_id TEXT;
ALTER TABLE public.other_income
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.other_income
  ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL;
ALTER TABLE public.other_income
  ADD COLUMN IF NOT EXISTS artist_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.other_income
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.other_income
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP POLICY IF EXISTS "Users can read other income" ON public.other_income;
CREATE POLICY "Users can read other income"
  ON public.other_income FOR SELECT
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND (
      public.has_team_permission(other_income.team_id, 'finance') OR
      public.has_team_permission(other_income.team_id, 'reports')
    ))
  );

DROP POLICY IF EXISTS "Managers can insert other income" ON public.other_income;
CREATE POLICY "Managers can insert other income"
  ON public.other_income FOR INSERT
  TO authenticated
  WITH CHECK (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND owner_id = auth.uid() AND public.has_team_permission(other_income.team_id, 'finance'))
  );

DROP POLICY IF EXISTS "Managers can update other income" ON public.other_income;
CREATE POLICY "Managers can update other income"
  ON public.other_income FOR UPDATE
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(other_income.team_id, 'finance'))
  )
  WITH CHECK (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND owner_id = auth.uid() AND public.has_team_permission(other_income.team_id, 'finance'))
  );

DROP POLICY IF EXISTS "Managers can delete other income" ON public.other_income;
CREATE POLICY "Managers can delete other income"
  ON public.other_income FOR DELETE
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(other_income.team_id, 'finance'))
  );

-- ============================================================
-- FINANCE ARTIST SCOPING
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_finance_artist_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_artist_owner UUID;
  v_artist_team UUID;
  v_artist_name TEXT;
BEGIN
  NEW.artist_name := COALESCE(BTRIM(NEW.artist_name), '');

  IF NEW.artist_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.owner_id, a.team_id, a.name
  INTO v_artist_owner, v_artist_team, v_artist_name
  FROM public.artists a
  WHERE a.id = NEW.artist_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance row references an unknown artist';
  END IF;

  IF NEW.team_id IS NULL THEN
    IF v_artist_team IS NOT NULL OR v_artist_owner IS DISTINCT FROM NEW.owner_id THEN
      RAISE EXCEPTION 'Finance row artist must belong to the same personal workspace';
    END IF;
  ELSE
    IF v_artist_team IS DISTINCT FROM NEW.team_id THEN
      RAISE EXCEPTION 'Finance row artist must belong to the same team workspace';
    END IF;
  END IF;

  NEW.artist_name := COALESCE(v_artist_name, '');
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_finance_artist_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_expenses_artist_fields ON public.expenses;
CREATE TRIGGER sync_expenses_artist_fields
  BEFORE INSERT OR UPDATE OF artist_id, artist_name, owner_id, team_id
  ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_finance_artist_fields();

DROP TRIGGER IF EXISTS sync_other_income_artist_fields ON public.other_income;
CREATE TRIGGER sync_other_income_artist_fields
  BEFORE INSERT OR UPDATE OF artist_id, artist_name, owner_id, team_id
  ON public.other_income
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_finance_artist_fields();

-- Safe backfill: only rows that already carry an explicit artist_name are linked.
-- Legacy rows with no artist signal remain unassigned/shared at roster level.
WITH matched_expense_artists AS (
  SELECT
    e.id AS expense_id,
    a.id AS artist_id,
    a.name AS artist_name,
    COUNT(*) OVER (PARTITION BY e.id) AS match_count
  FROM public.expenses e
  JOIN public.artists a
    ON LOWER(BTRIM(a.name)) = LOWER(BTRIM(e.artist_name))
   AND (
     (e.team_id IS NULL AND a.team_id IS NULL AND a.owner_id = e.owner_id)
     OR (e.team_id IS NOT NULL AND a.team_id = e.team_id)
   )
  WHERE e.artist_id IS NULL
    AND NULLIF(BTRIM(e.artist_name), '') IS NOT NULL
)
UPDATE public.expenses e
SET artist_id = m.artist_id,
    artist_name = m.artist_name
FROM matched_expense_artists m
WHERE e.id = m.expense_id
  AND m.match_count = 1;

UPDATE public.expenses e
SET artist_name = a.name
FROM public.artists a
WHERE e.artist_id = a.id
  AND NULLIF(BTRIM(e.artist_name), '') IS NULL;

WITH matched_income_artists AS (
  SELECT
    oi.id AS income_id,
    a.id AS artist_id,
    a.name AS artist_name,
    COUNT(*) OVER (PARTITION BY oi.id) AS match_count
  FROM public.other_income oi
  JOIN public.artists a
    ON LOWER(BTRIM(a.name)) = LOWER(BTRIM(oi.artist_name))
   AND (
     (oi.team_id IS NULL AND a.team_id IS NULL AND a.owner_id = oi.owner_id)
     OR (oi.team_id IS NOT NULL AND a.team_id = oi.team_id)
   )
  WHERE oi.artist_id IS NULL
    AND NULLIF(BTRIM(oi.artist_name), '') IS NOT NULL
)
UPDATE public.other_income oi
SET artist_id = m.artist_id,
    artist_name = m.artist_name
FROM matched_income_artists m
WHERE oi.id = m.income_id
  AND m.match_count = 1;

UPDATE public.other_income oi
SET artist_name = a.name
FROM public.artists a
WHERE oi.artist_id = a.id
  AND NULLIF(BTRIM(oi.artist_name), '') IS NULL;

-- ============================================================
-- AUDIENCE METRICS (per-artist monthly growth)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audience_metrics (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legacy_id         TEXT,
  owner_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id           UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  artist_id         UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  artist_name       TEXT NOT NULL DEFAULT '',
  period            TEXT NOT NULL, -- e.g. "2026-04"
  social_followers  NUMERIC DEFAULT 0,
  spotify_listeners NUMERIC DEFAULT 0,
  youtube_listeners NUMERIC DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audience_metrics ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audience_metrics
  ADD COLUMN IF NOT EXISTS legacy_id TEXT;
ALTER TABLE public.audience_metrics
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.audience_metrics
  ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES public.artists(id) ON DELETE CASCADE;
ALTER TABLE public.audience_metrics
  ADD COLUMN IF NOT EXISTS artist_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.audience_metrics
  ADD COLUMN IF NOT EXISTS social_followers NUMERIC DEFAULT 0;
ALTER TABLE public.audience_metrics
  ADD COLUMN IF NOT EXISTS spotify_listeners NUMERIC DEFAULT 0;
ALTER TABLE public.audience_metrics
  ADD COLUMN IF NOT EXISTS youtube_listeners NUMERIC DEFAULT 0;
ALTER TABLE public.audience_metrics
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.audience_metrics
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP POLICY IF EXISTS "Users can read audience metrics" ON public.audience_metrics;
CREATE POLICY "Users can read audience metrics"
  ON public.audience_metrics FOR SELECT
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = audience_metrics.team_id
        AND team_members.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Managers can insert audience metrics" ON public.audience_metrics;
CREATE POLICY "Managers can insert audience metrics"
  ON public.audience_metrics FOR INSERT
  TO authenticated
  WITH CHECK (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND owner_id = auth.uid() AND public.has_team_permission(audience_metrics.team_id, 'edit'))
  );

DROP POLICY IF EXISTS "Managers can update audience metrics" ON public.audience_metrics;
CREATE POLICY "Managers can update audience metrics"
  ON public.audience_metrics FOR UPDATE
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(audience_metrics.team_id, 'edit'))
  )
  WITH CHECK (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND owner_id = auth.uid() AND public.has_team_permission(audience_metrics.team_id, 'edit'))
  );

DROP POLICY IF EXISTS "Managers can delete audience metrics" ON public.audience_metrics;
CREATE POLICY "Managers can delete audience metrics"
  ON public.audience_metrics FOR DELETE
  TO authenticated
  USING (
    (team_id IS NULL AND owner_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(audience_metrics.team_id, 'edit'))
  );

-- ============================================================
-- REVENUE GOALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.revenue_goals (
  id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id  UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  amount   NUMERIC DEFAULT 0,
  period   TEXT NOT NULL DEFAULT 'monthly',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, period)
);

ALTER TABLE public.revenue_goals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.revenue_goals
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE public.revenue_goals
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.revenue_goals
  DROP CONSTRAINT IF EXISTS revenue_goals_user_id_period_key;

ALTER TABLE public.revenue_goals
  ADD CONSTRAINT revenue_goals_user_id_period_key UNIQUE (user_id, period);

ALTER TABLE public.revenue_goals
  DROP CONSTRAINT IF EXISTS revenue_goals_team_id_period_key;

ALTER TABLE public.revenue_goals
  ADD CONSTRAINT revenue_goals_team_id_period_key UNIQUE (team_id, period);

DROP POLICY IF EXISTS "Users can read revenue goals" ON public.revenue_goals;
CREATE POLICY "Users can read revenue goals"
  ON public.revenue_goals FOR SELECT
  TO authenticated
  USING (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND (
      public.has_team_permission(revenue_goals.team_id, 'finance') OR
      public.has_team_permission(revenue_goals.team_id, 'reports')
    ))
  );

DROP POLICY IF EXISTS "Managers can insert revenue goals" ON public.revenue_goals;
CREATE POLICY "Managers can insert revenue goals"
  ON public.revenue_goals FOR INSERT
  TO authenticated
  WITH CHECK (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(revenue_goals.team_id, 'finance'))
  );

DROP POLICY IF EXISTS "Managers can update revenue goals" ON public.revenue_goals;
CREATE POLICY "Managers can update revenue goals"
  ON public.revenue_goals FOR UPDATE
  TO authenticated
  USING (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(revenue_goals.team_id, 'finance'))
  )
  WITH CHECK (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(revenue_goals.team_id, 'finance'))
  );

DROP POLICY IF EXISTS "Managers can delete revenue goals" ON public.revenue_goals;
CREATE POLICY "Managers can delete revenue goals"
  ON public.revenue_goals FOR DELETE
  TO authenticated
  USING (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(revenue_goals.team_id, 'finance'))
  );

-- ============================================================
-- BALANCE BROUGHT FORWARD
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bbf_entries (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id    UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  period     TEXT NOT NULL,  -- e.g. "2025-01"
  amount     NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, period)
);

ALTER TABLE public.bbf_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bbf_entries
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE public.bbf_entries
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.bbf_entries
  DROP CONSTRAINT IF EXISTS bbf_entries_user_id_period_key;

ALTER TABLE public.bbf_entries
  ADD CONSTRAINT bbf_entries_user_id_period_key UNIQUE (user_id, period);

ALTER TABLE public.bbf_entries
  DROP CONSTRAINT IF EXISTS bbf_entries_team_id_period_key;

ALTER TABLE public.bbf_entries
  ADD CONSTRAINT bbf_entries_team_id_period_key UNIQUE (team_id, period);

DROP POLICY IF EXISTS "Users can read BBF" ON public.bbf_entries;
CREATE POLICY "Users can read BBF"
  ON public.bbf_entries FOR SELECT
  TO authenticated
  USING (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND (
      public.has_team_permission(bbf_entries.team_id, 'finance') OR
      public.has_team_permission(bbf_entries.team_id, 'reports')
    ))
  );

DROP POLICY IF EXISTS "Managers can insert BBF" ON public.bbf_entries;
CREATE POLICY "Managers can insert BBF"
  ON public.bbf_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(bbf_entries.team_id, 'finance'))
  );

DROP POLICY IF EXISTS "Managers can update BBF" ON public.bbf_entries;
CREATE POLICY "Managers can update BBF"
  ON public.bbf_entries FOR UPDATE
  TO authenticated
  USING (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(bbf_entries.team_id, 'finance'))
  )
  WITH CHECK (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(bbf_entries.team_id, 'finance'))
  );

DROP POLICY IF EXISTS "Managers can delete BBF" ON public.bbf_entries;
CREATE POLICY "Managers can delete BBF"
  ON public.bbf_entries FOR DELETE
  TO authenticated
  USING (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(bbf_entries.team_id, 'finance'))
  );

-- ============================================================
-- TASKS (Team-shared when team_id is set)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id         TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id    UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  due_date   DATE,
  completed  BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP POLICY IF EXISTS "Users can read tasks" ON public.tasks;
CREATE POLICY "Users can read tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = tasks.team_id
        AND team_members.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Managers can insert tasks" ON public.tasks;
CREATE POLICY "Managers can insert tasks"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND user_id = auth.uid() AND public.has_team_permission(tasks.team_id, 'edit'))
  );

DROP POLICY IF EXISTS "Managers can update tasks" ON public.tasks;
CREATE POLICY "Managers can update tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(tasks.team_id, 'edit'))
  )
  WITH CHECK (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND user_id = auth.uid() AND public.has_team_permission(tasks.team_id, 'edit'))
  );

DROP POLICY IF EXISTS "Managers can delete tasks" ON public.tasks;
CREATE POLICY "Managers can delete tasks"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(tasks.team_id, 'edit'))
  );

-- ============================================================
-- CLOSING THOUGHTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.closing_thoughts (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id    UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  period     TEXT NOT NULL,
  content    TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, period)
);

ALTER TABLE public.closing_thoughts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.closing_thoughts
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE public.closing_thoughts
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.closing_thoughts
  DROP CONSTRAINT IF EXISTS closing_thoughts_user_id_period_key;

ALTER TABLE public.closing_thoughts
  ADD CONSTRAINT closing_thoughts_user_id_period_key UNIQUE (user_id, period);

ALTER TABLE public.closing_thoughts
  DROP CONSTRAINT IF EXISTS closing_thoughts_team_id_period_key;

ALTER TABLE public.closing_thoughts
  ADD CONSTRAINT closing_thoughts_team_id_period_key UNIQUE (team_id, period);

DROP POLICY IF EXISTS "Users can read closing thoughts" ON public.closing_thoughts;
CREATE POLICY "Users can read closing thoughts"
  ON public.closing_thoughts FOR SELECT
  TO authenticated
  USING (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = closing_thoughts.team_id
        AND team_members.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Managers can insert closing thoughts" ON public.closing_thoughts;
CREATE POLICY "Managers can insert closing thoughts"
  ON public.closing_thoughts FOR INSERT
  TO authenticated
  WITH CHECK (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(closing_thoughts.team_id, 'edit'))
  );

DROP POLICY IF EXISTS "Managers can update closing thoughts" ON public.closing_thoughts;
CREATE POLICY "Managers can update closing thoughts"
  ON public.closing_thoughts FOR UPDATE
  TO authenticated
  USING (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(closing_thoughts.team_id, 'edit'))
  )
  WITH CHECK (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(closing_thoughts.team_id, 'edit'))
  );

DROP POLICY IF EXISTS "Managers can delete closing thoughts" ON public.closing_thoughts;
CREATE POLICY "Managers can delete closing thoughts"
  ON public.closing_thoughts FOR DELETE
  TO authenticated
  USING (
    (team_id IS NULL AND user_id = auth.uid()) OR
    (team_id IS NOT NULL AND public.has_team_permission(closing_thoughts.team_id, 'edit'))
  );

-- ============================================================
-- TEAM MESSAGES (Chatroom)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT NOT NULL,
  content     TEXT NOT NULL,
  msg_type    TEXT DEFAULT 'text' CHECK (msg_type IN ('text', 'note', 'alert')),
  pinned      BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS msg_type TEXT DEFAULT 'text';
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DROP POLICY IF EXISTS "Team members can view messages" ON public.messages;
CREATE POLICY "Team members can view messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = messages.team_id
        AND team_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Team members can post messages" ON public.messages;
CREATE POLICY "Team members can post messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = messages.team_id
        AND team_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;
CREATE POLICY "Users can delete own messages"
  ON public.messages FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- WORKSPACE SCOPE IMMUTABILITY
-- ============================================================
-- RLS checks row visibility and the proposed new row separately. These triggers
-- close the row-reassignment gap where a crafted UPDATE could otherwise move a
-- visible team row into a personal workspace, another team, or another owner.
CREATE OR REPLACE FUNCTION public.prevent_owner_workspace_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Workspace owner cannot be changed';
  END IF;

  IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    RAISE EXCEPTION 'Workspace scope cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_user_workspace_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Workspace user cannot be changed';
  END IF;

  IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    RAISE EXCEPTION 'Workspace scope cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_team_member_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    RAISE EXCEPTION 'Team membership cannot be moved between teams';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Team membership cannot be moved between users';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_owner_workspace_reassignment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_user_workspace_reassignment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_team_member_reassignment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_artists_workspace_reassignment ON public.artists;
CREATE TRIGGER prevent_artists_workspace_reassignment
  BEFORE UPDATE OF owner_id, team_id ON public.artists
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_owner_workspace_reassignment();

DROP TRIGGER IF EXISTS prevent_bookings_workspace_reassignment ON public.bookings;
CREATE TRIGGER prevent_bookings_workspace_reassignment
  BEFORE UPDATE OF owner_id, team_id ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_owner_workspace_reassignment();

DROP TRIGGER IF EXISTS prevent_expenses_workspace_reassignment ON public.expenses;
CREATE TRIGGER prevent_expenses_workspace_reassignment
  BEFORE UPDATE OF owner_id, team_id ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_owner_workspace_reassignment();

DROP TRIGGER IF EXISTS prevent_other_income_workspace_reassignment ON public.other_income;
CREATE TRIGGER prevent_other_income_workspace_reassignment
  BEFORE UPDATE OF owner_id, team_id ON public.other_income
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_owner_workspace_reassignment();

DROP TRIGGER IF EXISTS prevent_audience_metrics_workspace_reassignment ON public.audience_metrics;
CREATE TRIGGER prevent_audience_metrics_workspace_reassignment
  BEFORE UPDATE OF owner_id, team_id ON public.audience_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_owner_workspace_reassignment();

DROP TRIGGER IF EXISTS prevent_tasks_workspace_reassignment ON public.tasks;
CREATE TRIGGER prevent_tasks_workspace_reassignment
  BEFORE UPDATE OF user_id, team_id ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_workspace_reassignment();

DROP TRIGGER IF EXISTS prevent_revenue_goals_workspace_reassignment ON public.revenue_goals;
CREATE TRIGGER prevent_revenue_goals_workspace_reassignment
  BEFORE UPDATE OF user_id, team_id ON public.revenue_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_workspace_reassignment();

DROP TRIGGER IF EXISTS prevent_bbf_entries_workspace_reassignment ON public.bbf_entries;
CREATE TRIGGER prevent_bbf_entries_workspace_reassignment
  BEFORE UPDATE OF user_id, team_id ON public.bbf_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_workspace_reassignment();

DROP TRIGGER IF EXISTS prevent_closing_thoughts_workspace_reassignment ON public.closing_thoughts;
CREATE TRIGGER prevent_closing_thoughts_workspace_reassignment
  BEFORE UPDATE OF user_id, team_id ON public.closing_thoughts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_workspace_reassignment();

DROP TRIGGER IF EXISTS prevent_team_members_reassignment ON public.team_members;
CREATE TRIGGER prevent_team_members_reassignment
  BEFORE UPDATE OF user_id, team_id ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_team_member_reassignment();

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bookings_owner   ON public.bookings(owner_id);
CREATE INDEX IF NOT EXISTS idx_bookings_team    ON public.bookings(team_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date    ON public.bookings(date);
CREATE INDEX IF NOT EXISTS idx_expenses_owner   ON public.expenses(owner_id);
CREATE INDEX IF NOT EXISTS idx_expenses_team    ON public.expenses(team_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date    ON public.expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_artist ON public.expenses(artist_id);
CREATE INDEX IF NOT EXISTS idx_expenses_owner_artist_date ON public.expenses(owner_id, artist_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_team_artist_date ON public.expenses(team_id, artist_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_other_income_owner ON public.other_income(owner_id);
CREATE INDEX IF NOT EXISTS idx_other_income_team  ON public.other_income(team_id);
CREATE INDEX IF NOT EXISTS idx_other_income_artist ON public.other_income(artist_id);
CREATE INDEX IF NOT EXISTS idx_other_income_owner_artist_date ON public.other_income(owner_id, artist_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_other_income_team_artist_date ON public.other_income(team_id, artist_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_artists_owner    ON public.artists(owner_id);
CREATE INDEX IF NOT EXISTS idx_artists_team     ON public.artists(team_id);
CREATE INDEX IF NOT EXISTS idx_audience_metrics_owner  ON public.audience_metrics(owner_id);
CREATE INDEX IF NOT EXISTS idx_audience_metrics_team   ON public.audience_metrics(team_id);
CREATE INDEX IF NOT EXISTS idx_audience_metrics_artist ON public.audience_metrics(artist_id);
CREATE INDEX IF NOT EXISTS idx_audience_metrics_period ON public.audience_metrics(period);
CREATE INDEX IF NOT EXISTS idx_tasks_user       ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_team       ON public.tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_revenue_goals_user ON public.revenue_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_goals_team ON public.revenue_goals(team_id);
CREATE INDEX IF NOT EXISTS idx_bbf_entries_user ON public.bbf_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_bbf_entries_team ON public.bbf_entries(team_id);
CREATE INDEX IF NOT EXISTS idx_closing_thoughts_user ON public.closing_thoughts(user_id);
CREATE INDEX IF NOT EXISTS idx_closing_thoughts_team ON public.closing_thoughts(team_id);
CREATE INDEX IF NOT EXISTS idx_messages_team    ON public.messages(team_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_messages_team_created ON public.messages(team_id, created_at DESC);

-- ============================================================
-- Scope-aware uniqueness for legacy-origin IDs.
-- The runtime resolves rows by id/legacy_id inside the active workspace before
-- insert/update, so owner-only uniqueness is too broad: it can block a team row
-- when the same user's personal workspace already has the same legacy_id.
-- Run these once â€” they are idempotent (IF NOT EXISTS guard via DO block).
-- ============================================================
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_legacy_id_owner_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_legacy_id_owner_personal_idx
  ON public.bookings(legacy_id, owner_id)
  WHERE team_id IS NULL AND legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_legacy_id_team_idx
  ON public.bookings(legacy_id, team_id)
  WHERE team_id IS NOT NULL AND legacy_id IS NOT NULL;

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_legacy_id_owner_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_legacy_id_owner_personal_idx
  ON public.expenses(legacy_id, owner_id)
  WHERE team_id IS NULL AND legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_legacy_id_team_idx
  ON public.expenses(legacy_id, team_id)
  WHERE team_id IS NOT NULL AND legacy_id IS NOT NULL;

ALTER TABLE public.other_income DROP CONSTRAINT IF EXISTS other_income_legacy_id_owner_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS other_income_legacy_id_owner_personal_idx
  ON public.other_income(legacy_id, owner_id)
  WHERE team_id IS NULL AND legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS other_income_legacy_id_team_idx
  ON public.other_income(legacy_id, team_id)
  WHERE team_id IS NOT NULL AND legacy_id IS NOT NULL;

ALTER TABLE public.artists DROP CONSTRAINT IF EXISTS artists_legacy_id_owner_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS artists_legacy_id_owner_personal_idx
  ON public.artists(legacy_id, owner_id)
  WHERE team_id IS NULL AND legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS artists_legacy_id_team_idx
  ON public.artists(legacy_id, team_id)
  WHERE team_id IS NOT NULL AND legacy_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audience_metrics_artist_owner_period_key'
  ) THEN
    ALTER TABLE public.audience_metrics ADD CONSTRAINT audience_metrics_artist_owner_period_key
      UNIQUE (artist_id, owner_id, period);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audience_metrics_artist_team_period_key'
  ) THEN
    ALTER TABLE public.audience_metrics ADD CONSTRAINT audience_metrics_artist_team_period_key
      UNIQUE (artist_id, team_id, period);
  END IF;
END $$;

-- ============================================================
-- REALTIME: enable for live team features (idempotent)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'team_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'expenses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'artists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.artists;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'other_income'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.other_income;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'audience_metrics'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.audience_metrics;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'revenue_goals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.revenue_goals;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bbf_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bbf_entries;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'closing_thoughts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.closing_thoughts;
  END IF;
END $$;

-- ============================================================
-- DONE! Your schema is ready.
-- ============================================================
