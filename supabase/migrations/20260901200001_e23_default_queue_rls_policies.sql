-- E23: Fila padrão para contatos não atribuídos
-- Cria a "Fila Geral", adiciona todos os agentes ativos, move 1033 contatos
-- para a fila e ajusta as políticas RLS de messages e contacts para usar
-- queue_members em vez do furo (assigned_to IS NULL).
--
-- Aplicado em 2026-09-01 via db_transaction (direto no banco de produção).
-- Este arquivo garante reprodutibilidade ao rebuildar o banco do zero.

-- 1. Cria a fila padrão (id fixo para reprodutibilidade)
INSERT INTO queues (id, name, description, color, is_active, priority)
VALUES (
  '4daa900c-ea89-47d5-8c04-5a188cae296e',
  'Fila Geral',
  'Fila padrão para contatos não atribuídos a nenhum agente específico',
  '#4F46E5',
  true,
  1
) ON CONFLICT (id) DO NOTHING;

-- 2. Adiciona todos os agentes ativos como membros
INSERT INTO queue_members (id, queue_id, profile_id, is_active)
SELECT gen_random_uuid(), '4daa900c-ea89-47d5-8c04-5a188cae296e', p.id, true
FROM profiles p
WHERE p.is_active = true
ON CONFLICT (queue_id, profile_id) DO UPDATE SET is_active = true;

-- 3. Associa todos os contatos sem fila à Fila Geral
UPDATE contacts
SET queue_id = '4daa900c-ea89-47d5-8c04-5a188cae296e'
WHERE queue_id IS NULL;

-- 4. Remove furo "assigned_to IS NULL" de messages_select_policy;
--    substitui por queue membership
ALTER POLICY "messages_select_policy" ON public.messages USING (
  EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = messages.contact_id
    AND (
      is_admin_or_supervisor(auth.uid())
      OR c.assigned_to = get_profile_id_for_user(auth.uid())
      OR EXISTS (
        SELECT 1 FROM queue_members qm
        WHERE qm.queue_id = c.queue_id
          AND qm.profile_id = get_profile_id_for_user(auth.uid())
          AND qm.is_active = true
      )
    )
  )
);

-- 5. Adiciona queue membership em contacts_select_policy para que
--    agentes não-admin/supervisor possam enxergar contatos da fila
ALTER POLICY "contacts_select_policy" ON public.contacts USING (
  is_admin_or_supervisor(auth.uid())
  OR assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
  OR EXISTS (
    SELECT 1 FROM queue_members qm
    WHERE qm.queue_id = contacts.queue_id
      AND qm.profile_id = get_profile_id_for_user(auth.uid())
      AND qm.is_active = true
  )
);
