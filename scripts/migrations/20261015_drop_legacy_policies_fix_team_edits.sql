-- Star Paper live migration, 2026-10-15.
-- Run once in the Supabase SQL Editor (project fxcyocdwvjiyatqnaahg).
-- schema.sql carries the same end state for fresh installs.

BEGIN;

-- 1. Legacy FOR ALL policies let any team member write any team row and read
--    finance rows regardless of role. Policies are OR'ed, so they overrode the
--    role-scoped policies. Personal workspaces stay covered by those policies.
DROP POLICY IF EXISTS "Users can access their own artists" ON public.artists;
DROP POLICY IF EXISTS "Users can access their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can access their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can access their own other income" ON public.other_income;
DROP POLICY IF EXISTS "Users manage own BBF" ON public.bbf_entries;
DROP POLICY IF EXISTS "Users manage own revenue goals" ON public.revenue_goals;

-- 2. Team update checks no longer require the editor to be the row's creator.
--    owner_id/user_id/team_id cannot change anyway (workspace triggers).
DROP POLICY IF EXISTS "Managers can update artists" ON public.artists;
CREATE POLICY "Managers can update artists" ON public.artists FOR UPDATE TO authenticated
  USING ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(artists.team_id, 'edit')))
  WITH CHECK ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(artists.team_id, 'edit')));

DROP POLICY IF EXISTS "Managers can update bookings" ON public.bookings;
CREATE POLICY "Managers can update bookings" ON public.bookings FOR UPDATE TO authenticated
  USING ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(bookings.team_id, 'edit')))
  WITH CHECK ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(bookings.team_id, 'edit')));

DROP POLICY IF EXISTS "Managers can update expenses" ON public.expenses;
CREATE POLICY "Managers can update expenses" ON public.expenses FOR UPDATE TO authenticated
  USING ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(expenses.team_id, 'finance')))
  WITH CHECK ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(expenses.team_id, 'finance')));

DROP POLICY IF EXISTS "Managers can update other income" ON public.other_income;
CREATE POLICY "Managers can update other income" ON public.other_income FOR UPDATE TO authenticated
  USING ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(other_income.team_id, 'finance')))
  WITH CHECK ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(other_income.team_id, 'finance')));

DROP POLICY IF EXISTS "Managers can update audience metrics" ON public.audience_metrics;
CREATE POLICY "Managers can update audience metrics" ON public.audience_metrics FOR UPDATE TO authenticated
  USING ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(audience_metrics.team_id, 'edit')))
  WITH CHECK ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(audience_metrics.team_id, 'edit')));

DROP POLICY IF EXISTS "Managers can update tasks" ON public.tasks;
CREATE POLICY "Managers can update tasks" ON public.tasks FOR UPDATE TO authenticated
  USING ((team_id IS NULL AND user_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(tasks.team_id, 'edit')))
  WITH CHECK ((team_id IS NULL AND user_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(tasks.team_id, 'edit')));

-- 3. Expenses saved without a receipt were given the app's home page URL as a
--    "receipt" (img.src read-back bug, fixed in app.js). Clear those.
UPDATE public.expenses
SET receipt = ''
WHERE receipt ~ '^https?://(star-paper|starpaper)\.netlify\.app/?$';

COMMIT;
