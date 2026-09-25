-- Fecha o achado de RLS da auditoria adversarial de 25/09 que a PR #753
-- (REVOKE de expire_stale_agent_presence/notify_due_reminders) nao cobre.
--
-- messages: a policy de UPDATE nao tinha o branch de fila ativa que
-- SELECT ("messages_select_policy") e INSERT ("Users can insert
-- messages") ja tem -- inconsistencia que impedia um agente de fila (nao
-- dono do contato, mas com acesso via queue_members ativo) editar uma
-- mensagem que ele mesmo ja pode ver e criar. Mesma condicao das outras
-- duas policies, copiada literalmente.
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
