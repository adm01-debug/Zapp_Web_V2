-- Paridade de fila na policy de UPDATE de messages (recria o #718 com
-- version acima do max do ledger).
--
-- SELECT ("messages_select_policy") e INSERT ("Users can insert messages")
-- ja liberam o agente de fila ativo (queue_members.is_active) para os
-- contatos da sua fila; a policy de UPDATE nao tinha esse branch, entao o
-- mesmo agente que ve e cria a mensagem nao conseguia atualiza-la.
-- Ninguem perde acesso: o branch entra em OR.
ALTER POLICY "Users can update messages from their assigned contacts" ON public.messages
  USING (
    (contact_id IN (
      SELECT c.id FROM contacts c
      WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
    ))
    OR is_admin_or_supervisor(auth.uid())
    OR (EXISTS (
      SELECT 1 FROM contacts c
      JOIN queue_members qm ON qm.queue_id = c.queue_id
      WHERE c.id = messages.contact_id
        AND qm.profile_id = get_profile_id_for_user(auth.uid())
        AND qm.is_active = true
    ))
  );
