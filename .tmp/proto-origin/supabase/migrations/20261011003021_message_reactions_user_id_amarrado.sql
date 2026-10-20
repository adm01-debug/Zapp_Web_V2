-- message_reactions_user_id_amarrado
-- Rollback: recria as policies de INSERT/UPDATE/DELETE de public.message_reactions como estavam
-- Rollback: antes (20260413133214:68-117 + 20260401003034:41 + 20260317222728:32), sem a amarra de user_id.
-- Rollback (SQL executável, na ordem):
--   DROP POLICY IF EXISTS "message_reactions_insert_policy" ON public.message_reactions;
--   CREATE POLICY "message_reactions_insert_policy" ON public.message_reactions FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.id = message_id AND (public.is_admin_or_supervisor(auth.uid()) OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL)));
--   CREATE POLICY "Users can insert reactions for assigned contacts" ON public.message_reactions FOR INSERT TO authenticated WITH CHECK (contact_id IN (SELECT c.id FROM public.contacts c WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) OR is_admin_or_supervisor(auth.uid()));
--   DROP POLICY IF EXISTS "message_reactions_update_policy" ON public.message_reactions;
--   CREATE POLICY "message_reactions_update_policy" ON public.message_reactions FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.id = message_id AND (public.is_admin_or_supervisor(auth.uid()) OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL)));
--   DROP POLICY IF EXISTS "message_reactions_delete_policy" ON public.message_reactions;
--   CREATE POLICY "message_reactions_delete_policy" ON public.message_reactions FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.id = message_id AND (public.is_admin_or_supervisor(auth.uid()) OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL)));
--   CREATE POLICY "Users can delete their own reactions" ON public.message_reactions FOR DELETE TO authenticated USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
--
-- SEC-RLS_CONTATOS_MENSAGENS-04 (P2): as policies de INSERT/UPDATE/DELETE de
-- public.message_reactions checavam SÓ a visibilidade do contato/mensagem, nunca se o
-- user_id gravado é o do próprio chamador. Isso deixava qualquer agente autorizado a
-- gravar reação em nome de terceiro (personificação) e apagar reação alheia.
--
-- Correção: cada policy passa a exigir `user_id = public.get_profile_id_for_user(auth.uid())`
-- (predicado canônico caller-bound), MANTENDO a checagem de visibilidade que ela já tinha.
-- Não há exceção para admin: nenhum fluxo legítimo precisa gravar reação com user_id alheio.
-- Contrato conferido com src/hooks/reactions/useReactionMutations.ts:64-69 (upsert com
-- user_id = profileId do próprio autor), que segue funcionando.
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
        OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
        OR c.assigned_to IS NULL
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
        OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
        OR c.assigned_to IS NULL
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
        OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
        OR c.assigned_to IS NULL
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
        OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
        OR c.assigned_to IS NULL
      )
    )
  );
