-- Self-serve account deletion (Settings > Account > Delete my account).
-- Deletes the caller's auth user; every table that references auth.users
-- cascades, except ai_context, which is cleared here first. Uploaded files are
-- removed from storage by the app before it calls this.
-- A team owner whose team still has other members is refused, so teammates'
-- shared records are not deleted with the owner's account.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'NOT_SIGNED_IN';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.teams t
    JOIN public.team_members m ON m.team_id = t.id
    WHERE t.owner_id = uid AND m.user_id <> uid
  ) THEN
    RAISE EXCEPTION 'TEAM_HAS_MEMBERS';
  END IF;

  DELETE FROM public.ai_context WHERE user_id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
