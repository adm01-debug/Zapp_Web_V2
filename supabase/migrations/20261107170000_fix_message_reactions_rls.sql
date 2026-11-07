-- fix_message_reactions_rls
-- Rollback: restaura as policies de INSERT/UPDATE/DELETE de public.message_reactions
-- como estavam após 20261011003021_message_reactions_user_id_amarrado.sql (autoria amarrada,
-- mas visibilidade restrita a contato próprio/admin/sem dono).
-- Rollback (SQL executável, na ordem):
--   DROP POLICY IF EXISTS "message_reactions_insert_policy" ON public.message_reactions;
--   CREATE POLICY "message_reactions_insert_policy" ON public.message_reactions FOR INSERT TO authenticated WITH CHECK (user_id = public.get_profile_id_for_user(auth.uid()) AND EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.id = message_id AND (public.is_admin_or_supervisor(auth.uid()) OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL)));
--   DROP POLICY IF EXISTS "message_reactions_update_policy" ON public.message_reactions;
--   CREATE POLICY "message_reactions_update_policy" ON public.message_reactions FOR UPDATE TO authenticated USING (user_id = public.get_profile_id_for_user(auth.uid()) AND EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.id = message_id AND (public.is_admin_or_supervisor(auth.uid()) OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL))) WITH CHECK (user_id = public.get_profile_id_for_user(auth.uid()) AND EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.id = message_id AND (public.is_admin_or_supervisor(auth.uid()) OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL)));
--   DROP POLICY IF EXISTS "message_reactions_delete_policy" ON public.message_reactions;
--   CREATE POLICY "message_reactions_delete_policy" ON public.message_reactions FOR DELETE TO authenticated USING (user_id = public.get_profile_id_for_user(auth.uid()) AND EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.id = message_id AND (public.is_admin_or_supervisor(auth.uid()) OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL)));
--
-- SEC-RLS: e2e-logado (run 1518) falhou com HTTP 403 42501 "new row violates row-level
-- security policy for table "message_reactions"" ao adicionar reação. Causa: um agente de
-- Fila Geral VÊ a mensagem (messages_select_policy libera via get_visible_agent_ids +
-- queue_members ativo), mas as policies de escrita da reação só aceitavam contato
-- atribuído ao próprio perfil, admin/supervisor ou contato sem dono. Visibilidade ≠
-- escrita: quem lê a mensagem não conseguia reagir a ela.
--
-- Correção: a condição de visibilidade das policies de escrita de message_reactions passa
-- a ser a MESMA do messages_select_policy (20260902023200): admin/supervisor OU contato
-- atribuído a um agente visível (get_visible_agent_ids) OU contato em fila da qual o
-- usuário é membro ativo (queue_members). Mantém a amarra de autoria
-- user_id = public.get_profile_id_for_user(auth.uid()) — cada um reage apenas por si.
-- Não há exceção para admin: nenhum fluxo legítimo grava reação com user_id alheio.
--
-- Sem GRANT/ACL/papel alterado. Só as policies de escrita de message_reactions.
-- Idempotente: DROP IF EXISTS + CREATE.

DROP POLICY IF EXISTS "message_reactions_insert_policy" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can insert reactions for assigned contacts" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can insert reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Authenticated can insert reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Authenticated users can add reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Agents can react to visible messages" ON public.message_reactions;

CREATE POLICY "message_reactions_insert_policy" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.get_profile_id_for_user(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.contacts c ON c.id = m.contact_id
      WHERE m.id = message_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR m.contact_id IN (
          SELECT c2.id FROM public.contacts c2
          WHERE c2.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
        )
        OR EXISTS (
          SELECT 1 FROM public.contacts c3
          JOIN public.queue_members qm ON qm.queue_id = c3.queue_id
          WHERE c3.id = m.contact_id
            AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
            AND qm.is_active = true
        )
      )
    )
  );

DROP POLICY IF EXISTS "message_reactions_update_policy" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can update reactions" ON public.message_reactions;

CREATE POLICY "message_reactions_update_policy" ON public.message_reactions
  FOR UPDATE TO authenticated
  USING (
    user_id = public.get_profile_id_for_user(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.contacts c ON c.id = m.contact_id
      WHERE m.id = message_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR m.contact_id IN (
          SELECT c2.id FROM public.contacts c2
          WHERE c2.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
        )
        OR EXISTS (
          SELECT 1 FROM public.contacts c3
          JOIN public.queue_members qm ON qm.queue_id = c3.queue_id
          WHERE c3.id = m.contact_id
            AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
            AND qm.is_active = true
        )
      )
    )
  )
  WITH CHECK (
    user_id = public.get_profile_id_for_user(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.contacts c ON c.id = m.contact_id
      WHERE m.id = message_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR m.contact_id IN (
          SELECT c2.id FROM public.contacts c2
          WHERE c2.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
        )
        OR EXISTS (
          SELECT 1 FROM public.contacts c3
          JOIN public.queue_members qm ON qm.queue_id = c3.queue_id
          WHERE c3.id = m.contact_id
            AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
            AND qm.is_active = true
        )
      )
    )
  );

DROP POLICY IF EXISTS "message_reactions_delete_policy" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can delete reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can delete their own reactions" ON public.message_reactions;

CREATE POLICY "message_reactions_delete_policy" ON public.message_reactions
  FOR DELETE TO authenticated
  USING (
    user_id = public.get_profile_id_for_user(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.contacts c ON c.id = m.contact_id
      WHERE m.id = message_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR m.contact_id IN (
          SELECT c2.id FROM public.contacts c2
          WHERE c2.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
        )
        OR EXISTS (
          SELECT 1 FROM public.contacts c3
          JOIN public.queue_members qm ON qm.queue_id = c3.queue_id
          WHERE c3.id = m.contact_id
            AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
            AND qm.is_active = true
        )
      )
    )
  );