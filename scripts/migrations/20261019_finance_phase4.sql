-- Star Paper live migration, 2026-10-19 (finance phase 4).
-- Additive only: three new tables and three new optional columns. No existing
-- row is changed. schema.sql carries the same end state for fresh installs.

BEGIN;

-- 1. Payments received per booking (deposit and balance instalments), so
--    aging, collection time and cash-in dates use real dates.
CREATE TABLE IF NOT EXISTS public.booking_payments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  booking_id  UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  amount      NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
  paid_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  method      TEXT NOT NULL DEFAULT 'cash',
  ref         TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS booking_payments_booking_idx ON public.booking_payments (booking_id);
CREATE INDEX IF NOT EXISTS booking_payments_team_idx ON public.booking_payments (team_id);
CREATE INDEX IF NOT EXISTS booking_payments_owner_idx ON public.booking_payments (owner_id);
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read booking payments" ON public.booking_payments;
CREATE POLICY "Users can read booking payments" ON public.booking_payments FOR SELECT TO authenticated
  USING ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND (public.has_team_permission(booking_payments.team_id, 'finance') OR public.has_team_permission(booking_payments.team_id, 'reports'))));
DROP POLICY IF EXISTS "Managers can insert booking payments" ON public.booking_payments;
CREATE POLICY "Managers can insert booking payments" ON public.booking_payments FOR INSERT TO authenticated
  WITH CHECK ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND owner_id = auth.uid() AND public.has_team_permission(booking_payments.team_id, 'finance')));
DROP POLICY IF EXISTS "Managers can update booking payments" ON public.booking_payments;
CREATE POLICY "Managers can update booking payments" ON public.booking_payments FOR UPDATE TO authenticated
  USING ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(booking_payments.team_id, 'finance')))
  WITH CHECK ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(booking_payments.team_id, 'finance')));
DROP POLICY IF EXISTS "Managers can delete booking payments" ON public.booking_payments;
CREATE POLICY "Managers can delete booking payments" ON public.booking_payments FOR DELETE TO authenticated
  USING ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(booking_payments.team_id, 'finance')));

DROP TRIGGER IF EXISTS prevent_booking_payments_workspace_reassignment ON public.booking_payments;
CREATE TRIGGER prevent_booking_payments_workspace_reassignment
  BEFORE UPDATE OF owner_id, team_id ON public.booking_payments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_owner_workspace_reassignment();

-- 2. Monthly budget per expense category. period is 'YYYY-MM', or 'default'
--    for the amount used in every month without its own row.
CREATE TABLE IF NOT EXISTS public.category_budgets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  period      TEXT NOT NULL DEFAULT 'default' CHECK (period = 'default' OR period ~ '^\d{4}-\d{2}$'),
  category    TEXT NOT NULL,
  amount      NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Like revenue_goals: personal rows carry user_id, team rows carry team_id
-- (user_id NULL), so each constraint covers one kind and upserts can target it.
ALTER TABLE public.category_budgets DROP CONSTRAINT IF EXISTS category_budgets_user_key;
ALTER TABLE public.category_budgets ADD CONSTRAINT category_budgets_user_key UNIQUE (user_id, period, category);
ALTER TABLE public.category_budgets DROP CONSTRAINT IF EXISTS category_budgets_team_key;
ALTER TABLE public.category_budgets ADD CONSTRAINT category_budgets_team_key UNIQUE (team_id, period, category);
ALTER TABLE public.category_budgets ENABLE ROW LEVEL SECURITY;

-- 3. Finance settings per workspace: alert targets, minimum cash and forecast
--    assumptions, kept as one JSON document so new targets need no migration.
CREATE TABLE IF NOT EXISTS public.finance_settings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.finance_settings DROP CONSTRAINT IF EXISTS finance_settings_user_key;
ALTER TABLE public.finance_settings ADD CONSTRAINT finance_settings_user_key UNIQUE (user_id);
ALTER TABLE public.finance_settings DROP CONSTRAINT IF EXISTS finance_settings_team_key;
ALTER TABLE public.finance_settings ADD CONSTRAINT finance_settings_team_key UNIQUE (team_id);
ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;

-- Same rules as revenue_goals: finance can write, finance or reports can read.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['category_budgets', 'finance_settings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Users can read %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Users can read %1$s" ON public.%1$I FOR SELECT TO authenticated USING ((team_id IS NULL AND user_id = auth.uid()) OR (team_id IS NOT NULL AND (public.has_team_permission(team_id, ''finance'') OR public.has_team_permission(team_id, ''reports''))))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Managers can insert %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Managers can insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK ((team_id IS NULL AND user_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(team_id, ''finance'')))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Managers can update %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Managers can update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING ((team_id IS NULL AND user_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(team_id, ''finance''))) WITH CHECK ((team_id IS NULL AND user_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(team_id, ''finance'')))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Managers can delete %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Managers can delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING ((team_id IS NULL AND user_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(team_id, ''finance'')))', t);
    EXECUTE format('DROP TRIGGER IF EXISTS prevent_%1$s_workspace_reassignment ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER prevent_%1$s_workspace_reassignment BEFORE UPDATE OF user_id, team_id ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.prevent_user_workspace_reassignment()', t);
  END LOOP;
END $$;

-- 4. Optional fields on existing tables (empty by default).
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS promoter TEXT NOT NULL DEFAULT '';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS paid_to TEXT NOT NULL DEFAULT '';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS expenses_booking_idx ON public.expenses (booking_id);

COMMIT;
