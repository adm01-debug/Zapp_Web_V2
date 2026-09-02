-- E23: Fila padrão para contatos não atribuídos
-- Cria a "Fila Geral", adiciona todos os agentes ativos, move contatos
-- sem fila E sem dono para a fila, e ajusta:
--   1. messages_select_policy — remove furo assigned_to IS NULL, usa queue check
--   2. contacts_select_policy — adiciona queue membership para agents
--   3. auto_assign_to_queue_agent — set default queue quando queue_id IS NULL
--                                 e filtra auto-assign apenas a role='agent'
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
--    Admins/supervisors já têm visibilidade via is_admin_or_supervisor() no RLS,
--    mas adicioná-los garante visibilidade também na UI de filas.
INSERT INTO queue_members (id, queue_id, profile_id, is_active)
SELECT gen_random_uuid(), '4daa900c-ea89-47d5-8c04-5a188cae296e', p.id, true
FROM profiles p
WHERE p.is_active = true
ON CONFLICT (queue_id, profile_id) DO UPDATE SET is_active = true;

-- 3. Associa à Fila Geral apenas contatos sem fila E sem dono
--    Contatos já atribuídos a um agente não devem entrar na fila genérica.
UPDATE contacts
SET queue_id = '4daa900c-ea89-47d5-8c04-5a188cae296e'
WHERE queue_id IS NULL
  AND assigned_to IS NULL;

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

-- 5. Adiciona queue membership em contacts_select_policy
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

-- 6. Atualiza auto_assign_to_queue_agent para:
--    a) Definir a fila padrão quando queue_id IS NULL (evita contatos invisíveis)
--    b) Filtrar auto-atribuição apenas a role='agent' (evita atribuir a admins)
CREATE OR REPLACE FUNCTION public.auto_assign_to_queue_agent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  assigned_agent_id UUID;
  effective_queue_id UUID;
BEGIN
  -- Se não há fila e não há dono, busca a fila padrão (menor priority)
  IF NEW.queue_id IS NULL AND NEW.assigned_to IS NULL THEN
    SELECT id INTO effective_queue_id
    FROM public.queues
    WHERE is_active = true
    ORDER BY priority ASC, created_at ASC
    LIMIT 1;

    IF effective_queue_id IS NOT NULL THEN
      NEW.queue_id := effective_queue_id;
    END IF;
  END IF;

  -- Se há fila mas sem dono, atribui ao agent menos ocupado da fila
  IF NEW.queue_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
    SELECT qm.profile_id INTO assigned_agent_id
    FROM public.queue_members qm
    JOIN public.profiles p    ON p.id = qm.profile_id
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE qm.queue_id   = NEW.queue_id
      AND qm.is_active  = true
      AND p.is_active   = true
      AND ur.role       = 'agent'          -- apenas agents, nunca admins
    ORDER BY (
      SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id
    ) ASC
    LIMIT 1;

    IF assigned_agent_id IS NOT NULL THEN
      NEW.assigned_to := assigned_agent_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
