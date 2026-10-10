-- 20261009233622_fix_message_reactions_select_policy_user_id_type
-- Rollback: dropa a policy nova e recria com o predicado antigo `user_id = auth.uid()`.
-- Rollback (SQL executável, na ordem inversa):
--   drop policy if exists "message_reactions_select_policy" on public.message_reactions;
--   create policy "message_reactions_select_policy" on public.message_reactions for select to authenticated using (is_admin_or_supervisor(auth.uid()) or user_id = auth.uid() or contact_id in (select c.id from public.contacts c where c.assigned_to in (select get_visible_agent_ids(auth.uid()))));
-- Fix: message_reactions SELECT policy compares user_id (profile id) with auth.uid() (auth user id).
-- The column message_reactions.user_id stores a profile id (public.profiles.id), not an auth user uuid.
-- Comparing it directly with auth.uid() always fails for non-admin users, so they never see their own reactions.
-- Fix: use get_profile_id_for_user(auth.uid()) to convert the auth user id to a profile id.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='message_reactions' AND policyname='message_reactions_select_policy') THEN
    DROP POLICY "message_reactions_select_policy" ON public.message_reactions;
  END IF;
END $$;
CREATE POLICY "message_reactions_select_policy" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    OR user_id = get_profile_id_for_user(auth.uid())
    OR contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
    )
  );