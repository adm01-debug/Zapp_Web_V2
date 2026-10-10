-- Fecha brecha encontrada em auditoria: a policy de INSERT em `messages`
-- validava apenas o agent_id do remetente (ou admin/supervisor), sem checar
-- se o `contact_id` da mensagem é um contato visível ao agente autenticado.
-- Um agente comum conseguia inserir uma linha em `messages` (incl.
-- message_type='location') para QUALQUER contato do sistema, forjando
-- histórico de conversa. Não afeta envio real de WhatsApp: a trigger
-- guard_message_delivery_internal_fields já bloqueia client_message_id
-- para roles != postgres/service_role, então essa linha forjada nunca é
-- reivindicada por claim_outbound_message. RPCs legítimas (ex.
-- enqueue_outbound_message) e ingestão inbound (ingest_inbound_message,
-- SECURITY DEFINER/service_role) não são afetadas por RLS e continuam
-- funcionando sem mudança.
--
-- A nova condição de visibilidade de contato espelha exatamente a já
-- usada na policy de SELECT (messages_select_policy): agente responsável
-- (get_visible_agent_ids) OU membro ativo da fila do contato.

DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;

CREATE POLICY "Users can insert messages" ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin_or_supervisor(auth.uid())
  OR (
    (agent_id IS NULL OR agent_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
    AND (
      contact_id IN (
        SELECT c.id FROM contacts c
        WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
      )
      OR EXISTS (
        SELECT 1 FROM contacts c
        JOIN queue_members qm ON qm.queue_id = c.queue_id
        WHERE c.id = messages.contact_id
          AND qm.profile_id = get_profile_id_for_user(auth.uid())
          AND qm.is_active = true
      )
    )
  )
);
