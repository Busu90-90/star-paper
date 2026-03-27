-- ============================================================
-- STAR PAPER — SUPABASE DATABASE SCHEMA
-- Run this entire file in your Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (extends auth.users — one row per user)
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
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_theme TEXT DEFAULT 'dark';

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- USERNAME HELPERS (signup + login)
-- ============================================================
-- Check username availability without exposing full profiles.
CREATE OR REPLACE FUNCTION public.is_username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(username) = lower(p_username)
  );
$$;

-- Resolve an email by username to support username-based login.
CREATE OR REPLACE FUNCTION public.get_email_for_username(p_username TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT email
  FROM public.profiles
  WHERE lower(username) = lower(p_username)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.is_username_available(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_for_username(TEXT) TO anon, authenticated;

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code  TEXT UNIQUE DEFAULT substr(md5(random()::TEXT), 1, 8),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TEAM MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('owner', 'manager', 'viewer')),
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helper: returns all team_ids the given user belongs to.
-- Executes with elevated privileges so it bypasses RLS on the inner lookup,
-- preventing the infinite recursion that happens when the SELECT policy on
-- team_members references team_members itself.
CREATE OR REPLACE FUNCTION public.get_my_team_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = uid;
$$;

-- Grant to authenticated users so the policy can call it
GRANT EXECUTE ON FUNCTION public.get_my_team_ids(UUID) TO authenticated;

-- ── ATOMIC TEAM CREATION ────────────────────────────────────────────────────────
-- Creates a team AND adds the creator as owner in a single transaction.
-- Using one RPC call = one Supabase auth-lock acquisition instead of two,
-- which eliminates the "AbortError: Lock broken by steal" race condition.
CREATE OR REPLACE FUNCTION public.create_team_with_member(
  p_name     TEXT,
  p_owner_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team public.teams;
BEGIN
  -- Insert the team
  INSERT INTO public.teams (name, owner_id)
  VALUES (p_name, p_owner_id)
  RETURNING * INTO v_team;

  -- Insert creator as owner member in the same transaction
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (v_team.id, p_owner_id, 'owner');

  RETURN row_to_json(v_team);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_team_with_member(TEXT, UUID) TO authenticated;

-- ── ATOMIC TEAM JOIN ────────────────────────────────────────────────────────────
-- Looks up a team by invite code and inserts the member row in one transaction.
-- Replaces two sequential SELECT + INSERT calls, eliminating the lock contention
-- that caused "AbortError: Lock broken by steal" during the join flow.
-- Returns the team row as JSON, or raises an exception if code is invalid.
CREATE OR REPLACE FUNCTION public.join_team_by_code(
  p_invite_code TEXT,
  p_user_id     UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team public.teams;
BEGIN
  -- Look up team by normalised invite code
  SELECT * INTO v_team
  FROM public.teams
  WHERE invite_code = lower(trim(p_invite_code));

  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  -- Insert member (ignore duplicate — already a member is fine)
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (v_team.id, p_user_id, 'manager')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  RETURN row_to_json(v_team);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_team_by_code(TEXT, UUID) TO authenticated;

DROP POLICY IF EXISTS "Team members can view other team members" ON public.team_members;
CREATE POLICY "Team members can view other team members"
  ON public.team_members FOR SELECT
  USING (
    team_id IN (SELECT public.get_my_team_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Team owners can manage members" ON public.team_members;
DROP POLICY IF EXISTS "Team owners can update members" ON public.team_members;
DROP POLICY IF EXISTS "Team owners can delete members" ON public.team_members;
-- Split the old FOR ALL into UPDATE and DELETE only.
-- A FOR ALL policy applies its USING clause to SELECT as well, causing a second
-- cross-table RLS evaluation on every team_members SELECT — this is what causes
-- the 8-second timeout for non-owner members. Limiting to UPDATE+DELETE means
-- the expensive EXISTS(FROM teams ...) check only runs when actually needed.
CREATE POLICY "Team owners can update members"
  ON public.team_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = team_members.team_id
        AND teams.owner_id = auth.uid()
    )
  );

CREATE POLICY "Team owners can delete members"
  ON public.team_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = team_members.team_id
        AND teams.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can join teams (insert themselves)" ON public.team_members;
CREATE POLICY "Users can join teams (insert themselves)"
  ON public.team_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Team members can view their teams" ON public.teams;
CREATE POLICY "Team members can view their teams"
  ON public.teams FOR SELECT
  USING (
    auth.uid() = owner_id OR
    id IN (SELECT public.get_my_team_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Only owner can update team" ON public.teams;
CREATE POLICY "Only owner can update team"
  ON public.teams FOR UPDATE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
CREATE POLICY "Authenticated users can create teams"
  ON public.teams FOR INSERT
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
  avatar       TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read artists" ON public.artists;
CREATE POLICY "Users can read artists"
  ON public.artists FOR SELECT
  USING (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = artists.team_id
        AND team_members.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Managers can insert artists" ON public.artists;
CREATE POLICY "Managers can insert artists"
  ON public.artists FOR INSERT
  WITH CHECK (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = artists.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

DROP POLICY IF EXISTS "Managers can update artists" ON public.artists;
CREATE POLICY "Managers can update artists"
  ON public.artists FOR UPDATE
  USING (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = artists.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  )
  WITH CHECK (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = artists.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

DROP POLICY IF EXISTS "Managers can delete artists" ON public.artists;
CREATE POLICY "Managers can delete artists"
  ON public.artists FOR DELETE
  USING (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = artists.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
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
  fee            NUMERIC DEFAULT 0,
  deposit        NUMERIC DEFAULT 0,
  balance        NUMERIC DEFAULT 0,
  contact        TEXT DEFAULT '',
  status         TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed')),
  notes          TEXT DEFAULT '',
  location_type  TEXT DEFAULT 'uganda',
  location       TEXT DEFAULT '',
  mock_key       TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read bookings" ON public.bookings;
CREATE POLICY "Users can read bookings"
  ON public.bookings FOR SELECT
  USING (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = bookings.team_id
        AND team_members.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Managers can insert bookings" ON public.bookings;
CREATE POLICY "Managers can insert bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = bookings.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

DROP POLICY IF EXISTS "Managers can update bookings" ON public.bookings;
CREATE POLICY "Managers can update bookings"
  ON public.bookings FOR UPDATE
  USING (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = bookings.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  )
  WITH CHECK (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = bookings.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

DROP POLICY IF EXISTS "Managers can delete bookings" ON public.bookings;
CREATE POLICY "Managers can delete bookings"
  ON public.bookings FOR DELETE
  USING (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = bookings.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legacy_id   TEXT,
  owner_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount      NUMERIC DEFAULT 0,
  date        DATE,
  category    TEXT DEFAULT 'other',
  receipt     TEXT DEFAULT '',
  mock_key    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read expenses" ON public.expenses;
CREATE POLICY "Users can read expenses"
  ON public.expenses FOR SELECT
  USING (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = expenses.team_id
        AND team_members.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Managers can insert expenses" ON public.expenses;
CREATE POLICY "Managers can insert expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = expenses.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

DROP POLICY IF EXISTS "Managers can update expenses" ON public.expenses;
CREATE POLICY "Managers can update expenses"
  ON public.expenses FOR UPDATE
  USING (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = expenses.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  )
  WITH CHECK (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = expenses.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

DROP POLICY IF EXISTS "Managers can delete expenses" ON public.expenses;
CREATE POLICY "Managers can delete expenses"
  ON public.expenses FOR DELETE
  USING (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = expenses.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

-- ============================================================
-- OTHER INCOME
-- ============================================================
CREATE TABLE IF NOT EXISTS public.other_income (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legacy_id   TEXT,
  owner_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,
  amount      NUMERIC DEFAULT 0,
  date        DATE,
  type        TEXT DEFAULT 'tips',
  payer       TEXT DEFAULT '',
  method      TEXT DEFAULT 'cash',
  status      TEXT DEFAULT 'received',
  notes       TEXT DEFAULT '',
  mock_key    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.other_income ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read other income" ON public.other_income;
CREATE POLICY "Users can read other income"
  ON public.other_income FOR SELECT
  USING (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = other_income.team_id
        AND team_members.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Managers can insert other income" ON public.other_income;
CREATE POLICY "Managers can insert other income"
  ON public.other_income FOR INSERT
  WITH CHECK (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = other_income.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

DROP POLICY IF EXISTS "Managers can update other income" ON public.other_income;
CREATE POLICY "Managers can update other income"
  ON public.other_income FOR UPDATE
  USING (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = other_income.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  )
  WITH CHECK (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = other_income.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

DROP POLICY IF EXISTS "Managers can delete other income" ON public.other_income;
CREATE POLICY "Managers can delete other income"
  ON public.other_income FOR DELETE
  USING (
    owner_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = other_income.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
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
  USING (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = revenue_goals.team_id
        AND team_members.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Managers can insert revenue goals" ON public.revenue_goals;
CREATE POLICY "Managers can insert revenue goals"
  ON public.revenue_goals FOR INSERT
  WITH CHECK (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = revenue_goals.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

DROP POLICY IF EXISTS "Managers can update revenue goals" ON public.revenue_goals;
CREATE POLICY "Managers can update revenue goals"
  ON public.revenue_goals FOR UPDATE
  USING (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = revenue_goals.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  )
  WITH CHECK (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = revenue_goals.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

DROP POLICY IF EXISTS "Managers can delete revenue goals" ON public.revenue_goals;
CREATE POLICY "Managers can delete revenue goals"
  ON public.revenue_goals FOR DELETE
  USING (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = revenue_goals.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
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
  USING (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = bbf_entries.team_id
        AND team_members.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Managers can insert BBF" ON public.bbf_entries;
CREATE POLICY "Managers can insert BBF"
  ON public.bbf_entries FOR INSERT
  WITH CHECK (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = bbf_entries.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

DROP POLICY IF EXISTS "Managers can update BBF" ON public.bbf_entries;
CREATE POLICY "Managers can update BBF"
  ON public.bbf_entries FOR UPDATE
  USING (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = bbf_entries.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  )
  WITH CHECK (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = bbf_entries.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

DROP POLICY IF EXISTS "Managers can delete BBF" ON public.bbf_entries;
CREATE POLICY "Managers can delete BBF"
  ON public.bbf_entries FOR DELETE
  USING (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = bbf_entries.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
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

DROP POLICY IF EXISTS "Users can read tasks" ON public.tasks;
CREATE POLICY "Users can read tasks"
  ON public.tasks FOR SELECT
  USING (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = tasks.team_id
        AND team_members.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Managers can insert tasks" ON public.tasks;
CREATE POLICY "Managers can insert tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND (
      team_id IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_members.team_id = tasks.team_id
          AND team_members.user_id = auth.uid()
          AND team_members.role IN ('owner','manager')
      )
    )
  );

DROP POLICY IF EXISTS "Managers can update tasks" ON public.tasks;
CREATE POLICY "Managers can update tasks"
  ON public.tasks FOR UPDATE
  USING (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = tasks.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  )
  WITH CHECK (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = tasks.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

DROP POLICY IF EXISTS "Managers can delete tasks" ON public.tasks;
CREATE POLICY "Managers can delete tasks"
  ON public.tasks FOR DELETE
  USING (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = tasks.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
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
  USING (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = closing_thoughts.team_id
        AND team_members.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Managers can insert closing thoughts" ON public.closing_thoughts;
CREATE POLICY "Managers can insert closing thoughts"
  ON public.closing_thoughts FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND (
      team_id IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_members.team_id = closing_thoughts.team_id
          AND team_members.user_id = auth.uid()
          AND team_members.role IN ('owner','manager')
      )
    )
  );

DROP POLICY IF EXISTS "Managers can update closing thoughts" ON public.closing_thoughts;
CREATE POLICY "Managers can update closing thoughts"
  ON public.closing_thoughts FOR UPDATE
  USING (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = closing_thoughts.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  )
  WITH CHECK (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = closing_thoughts.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
  );

DROP POLICY IF EXISTS "Managers can delete closing thoughts" ON public.closing_thoughts;
CREATE POLICY "Managers can delete closing thoughts"
  ON public.closing_thoughts FOR DELETE
  USING (
    user_id = auth.uid() OR
    (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = closing_thoughts.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner','manager')
    ))
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

DROP POLICY IF EXISTS "Team members can view messages" ON public.messages;
CREATE POLICY "Team members can view messages"
  ON public.messages FOR SELECT
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
  USING (user_id = auth.uid());

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bookings_owner   ON public.bookings(owner_id);
CREATE INDEX IF NOT EXISTS idx_bookings_team    ON public.bookings(team_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date    ON public.bookings(date);
CREATE INDEX IF NOT EXISTS idx_expenses_owner   ON public.expenses(owner_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date    ON public.expenses(date);
CREATE INDEX IF NOT EXISTS idx_other_income_owner ON public.other_income(owner_id);
CREATE INDEX IF NOT EXISTS idx_artists_owner    ON public.artists(owner_id);
CREATE INDEX IF NOT EXISTS idx_messages_team    ON public.messages(team_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);

-- ============================================================
-- UNIQUE CONSTRAINTS for legacy_id + owner_id
-- Required for cloud-first upsert deduplication (legacy numeric IDs
-- from localStorage records need a stable conflict target that is NOT
-- the auto-generated UUID primary key).
-- Run these once — they are idempotent (IF NOT EXISTS guard via DO block).
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_legacy_id_owner_id_key'
  ) THEN
    ALTER TABLE public.bookings ADD CONSTRAINT bookings_legacy_id_owner_id_key
      UNIQUE (legacy_id, owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_legacy_id_owner_id_key'
  ) THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_legacy_id_owner_id_key
      UNIQUE (legacy_id, owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'other_income_legacy_id_owner_id_key'
  ) THEN
    ALTER TABLE public.other_income ADD CONSTRAINT other_income_legacy_id_owner_id_key
      UNIQUE (legacy_id, owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'artists_legacy_id_owner_id_key'
  ) THEN
    ALTER TABLE public.artists ADD CONSTRAINT artists_legacy_id_owner_id_key
      UNIQUE (legacy_id, owner_id);
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

-- ============================================================
-- DONE! Your schema is ready.
-- ============================================================
