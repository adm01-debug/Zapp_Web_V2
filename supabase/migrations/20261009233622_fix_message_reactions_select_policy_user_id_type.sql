-- 20261009233622_fix_message_reactions_select_policy_user_id_type
-- Rollback: dropa a policy corrigida e recria com o predicado antigo user_id = auth.uid().
--   DROP POLICY IF EXISTS "message_reactions_select_policy" ON public.message_reactions;
--   CREATE POLICY "message_reactions_select_policy" ON public.message_reactions FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()) OR user_id = auth.uid() OR contact_id IN (SELECT c.id FROM public.contacts c WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))));
-- Fix: message_reactions SELECT policy compares user_id (profile id) with auth.uid() (auth user id).
-- The column message_reactions.user_id stores a profile id (public.profiles.id), not an auth user uuid.
-- Comparing it directly with auth.uid() always fails for non-admin users, so they never see their own reactions.
-- Fix: use get_profile_id_for_user(auth.uid()) to convert the auth user id to a profile id.

DROP POLICY IF EXISTS "message_reactions_select_policy" ON public.message_reactions;
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
