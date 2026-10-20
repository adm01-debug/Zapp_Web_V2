-- Achado da auditoria de 5 agentes desta sessao: as policies de RLS de
-- conversation_snoozes/pinned_conversations/favorite_contacts so validam
-- dono da linha (snoozed_by/user_id/pinned_by = auth.uid()), nunca se o
-- contact_id apontado e um contato que o usuario de fato enxerga (mesma
-- regra de contacts_select_policy: admin/supervisor, assigned_to num
-- "visible agent id", ou membro ativo da fila do contato). Um agente comum
-- podia inserir uma linha apontando para QUALQUER contact_id do sistema --
-- nao vaza dado do contato em si (o join com contacts continua filtrado
-- pela RLS de contacts), mas e um oraculo de existencia de UUID (insert
-- sucede se o contato existe, falha por FK se nao existe, independente de
-- visibilidade) e permite lixo de linhas para contatos fora de alcance.
--
-- Fix e so no INSERT (WITH CHECK), nao em UPDATE/SELECT/DELETE: um pin ja
-- existente nao pode virar orfao so porque o contato mudou de fila/dono
-- depois -- o dono da linha continua podendo ve-la/reordena-la/apaga-la.
-- A checagem de visibilidade reusa contacts_select_policy via subquery em
-- vez de duplicar a logica: como esta funcao roda como o usuario logado
-- (nao SECURITY DEFINER), a subquery em contacts ja sofre a RLS de
-- contacts automaticamente -- se o contato nao e visivel, o EXISTS da
-- falso e o INSERT e rejeitado, sem precisar repetir is_admin_or_supervisor
-- /get_visible_agent_ids/queue_members aqui.

-- conversation_snoozes: so a policy de INSERT precisa mudar (SELECT/DELETE
-- ja sao so-dono e continuam assim).
DROP POLICY IF EXISTS "Users can create own snoozes" ON public.conversation_snoozes;

CREATE POLICY "Users can create own snoozes"
  ON public.conversation_snoozes
  FOR INSERT
  WITH CHECK (
    snoozed_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = conversation_snoozes.contact_id)
  );

-- favorite_contacts: a policy unica "FOR ALL" cobria SELECT/INSERT/UPDATE/
-- DELETE com o mesmo qual -- separada em 4 pra so o INSERT ganhar a
-- checagem extra de visibilidade.
DROP POLICY IF EXISTS "Users can manage own favorites" ON public.favorite_contacts;

CREATE POLICY "Users can view own favorites"
  ON public.favorite_contacts
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own favorites"
  ON public.favorite_contacts
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = favorite_contacts.contact_id)
  );

CREATE POLICY "Users can update own favorites"
  ON public.favorite_contacts
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own favorites"
  ON public.favorite_contacts
  FOR DELETE
  USING (user_id = auth.uid());

-- pinned_conversations: mesma separacao.
DROP POLICY IF EXISTS "Users can manage own pins" ON public.pinned_conversations;

CREATE POLICY "Users can view own pins"
  ON public.pinned_conversations
  FOR SELECT
  USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can create own pins"
  ON public.pinned_conversations
  FOR INSERT
  WITH CHECK (
    pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = pinned_conversations.contact_id)
  );

CREATE POLICY "Users can update own pins"
  ON public.pinned_conversations
  FOR UPDATE
  USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
  WITH CHECK (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can delete own pins"
  ON public.pinned_conversations
  FOR DELETE
  USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));
