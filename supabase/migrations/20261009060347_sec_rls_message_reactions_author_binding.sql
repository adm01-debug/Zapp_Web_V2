-- sec_rls_message_reactions_author_binding
-- Rollback: DROP POLICY IF EXISTS "message_reactions_insert_policy" ON public.message_reactions;
-- Rollback: DROP POLICY IF EXISTS "Users can insert reactions for assigned contacts" ON public.message_reactions;
-- Rollback: DROP POLICY IF EXISTS "message_reactions_update_policy" ON public.message_reactions;
-- Rollback: DROP POLICY IF EXISTS "message_reactions_delete_policy" ON public.message_reactions;
-- Rollback: CREATE POLICY "message_reactions_insert_policy" ON public.message_reactions FOR INSERT TO authenticated WITH CHECK ( EXISTS ( SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.id = message_id AND ( public.is_admin_or_supervisor(auth.uid()) OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL ) ) );
-- Rollback: CREATE POLICY "Users can insert reactions for assigned contacts" ON public.message_reactions FOR INSERT TO authenticated WITH CHECK ( contact_id IN ( SELECT c.id FROM public.contacts c WHERE c.assigned_to IN ( SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() ) ) OR public.is_admin_or_supervisor(auth.uid()) );
-- Rollback: CREATE POLICY "message_reactions_update_policy" ON public.message_reactions FOR UPDATE TO authenticated USING ( EXISTS ( SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.id = message_id AND ( public.is_admin_or_supervisor(auth.uid()) OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL ) ) );
-- Rollback: CREATE POLICY "message_reactions_delete_policy" ON public.message_reactions FOR DELETE TO authenticated USING ( EXISTS ( SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.id = message_id AND ( public.is_admin_or_supervisor(auth.uid()) OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL ) ) );
--
-- SEC-RLS_CONTATOS_MENSAGENS-04 (P2): `message_reactions.user_id` (FK de profiles.id) nao era
-- amarrado ao chamador. As 4 policies de ESCRITA deixavam gravar/alterar/apagar reacao em nome de
-- outro perfil (personificacao) e remover a reacao alheia. Aqui cada policy de escrita passa a
-- exigir `user_id = get_profile_id_for_user(auth.uid())`; o predicado de VISIBILIDADE (contato da
-- mensagem) de cada policy permanece identico, e "Users can delete their own reactions" (que ja
-- vincula o autor) nao e tocada.

-- 1) INSERT por mensagem visivel: mesma visibilidade de antes + autor preso ao chamador.
DROP POLICY IF EXISTS "message_reactions_insert_policy" ON public.message_reactions;
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

-- 2) INSERT legado por contato atribuido (permissiva que soma por OR): mesmo predicado + autor.
DROP POLICY IF EXISTS "Users can insert reactions for assigned contacts" ON public.message_reactions;
CREATE POLICY "Users can insert reactions for assigned contacts" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.get_profile_id_for_user(auth.uid())
    AND (
      contact_id IN (
        SELECT c.id FROM public.contacts c
        WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
      )
      OR public.is_admin_or_supervisor(auth.uid())
    )
  );

-- 3) UPDATE: USING (linha existente) e WITH CHECK (linha nova) exigem ser o autor e ver a mensagem.
DROP POLICY IF EXISTS "message_reactions_update_policy" ON public.message_reactions;
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

-- 4) DELETE: so a propria reacao (era: qualquer reacao de mensagem visivel).
DROP POLICY IF EXISTS "message_reactions_delete_policy" ON public.message_reactions;
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
