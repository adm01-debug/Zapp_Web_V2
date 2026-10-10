-- 20261011000015_fix_message_reactions_select_policy_user_id_type
-- Rollback: DROP POLICY IF EXISTS "message_reactions_select_policy" ON public.message_reactions; CREATE POLICY "message_reactions_select_policy" ON public.message_reactions FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()) OR user_id = auth.uid() OR contact_id IN (SELECT c.id FROM public.contacts c WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))));
-- Fix (N-142): a policy message_reactions_select_policy comparava user_id com
-- auth.uid(), mas message_reactions.user_id guarda public.profiles.id (perfil),
-- nao auth.users.id (login). Para todo usuario nao-admin a comparacao nunca
-- casava e o autor nunca via a propria reacao pelo ramo user_id. Correcao:
-- converte o id de login no id de perfil com get_profile_id_for_user(auth.uid()).
-- (Corrige tambem o comentario da migration de origem, que dizia
-- "user_id e auth.users.id".) Sem SECURITY DEFINER/GRANT aqui: so troca o
-- predicado de uma policy SELECT ja existente (TO authenticated, sem mudar roles).
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
