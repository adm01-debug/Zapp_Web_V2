-- Expande a policy de UPDATE em contacts para incluir membros de fila
-- Agentes membros de uma fila podem atualizar contacts atribuidos a essa fila
-- (ex: atualizar conversation_status='resolved' ao encerrar conversa)
--
-- Antes: apenas assigned_to ou is_admin_or_supervisor
-- Depois: + queue_id IS NOT NULL AND queue_members ativos

DROP POLICY IF EXISTS "Users can update their assigned contacts" ON public.contacts;

CREATE POLICY "Users can update their assigned contacts"
ON public.contacts
FOR UPDATE
USING (
  (assigned_to IN (SELECT get_visible_agent_ids(auth.uid())))
  OR is_admin_or_supervisor(auth.uid())
  OR (
    queue_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM queue_members qm
      WHERE qm.queue_id = contacts.queue_id
        AND qm.profile_id = get_profile_id_for_user(auth.uid())
        AND qm.is_active = true
    )
  )
);
