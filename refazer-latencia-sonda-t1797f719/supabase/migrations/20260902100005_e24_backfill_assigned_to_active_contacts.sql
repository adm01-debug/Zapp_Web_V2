-- E24: Backfill de assigned_to para contatos ativos com atividade nos últimos 30 dias.
--
-- Problemas na versão anterior:
--   1. Round-robin usava pool global de agents em vez dos members da fila de cada contato.
--      Corrigido: CTE queue_agents seleciona apenas membros ativos da fila de cada contato.
--   2. WHERE externo não tinha AND c.assigned_to IS NULL (TOCTOU guard).
--      Corrigido: UPDATE final garante que não sobrescreve assignments concorrentes.
--   3. Sem guard contra divisão por zero se a fila não tiver agents.
--      Corrigido: AND qa.agents_in_queue > 0.
--
-- Estratégia: contatos COM mensagens nos últimos 30 dias são distribuídos em
-- round-robin entre os agentes ATIVOS na MESMA FILA do contato.
-- Os 319 sem atividade recente ficam no pool (queue_id set, assigned_to NULL).
-- Idempotente: WHERE c.assigned_to IS NULL evita re-atribuição.

WITH ranked_contacts AS (
  SELECT
    c.id,
    c.queue_id,
    ROW_NUMBER() OVER(PARTITION BY c.queue_id ORDER BY c.id) - 1 AS rn_in_queue
  FROM public.contacts c
  WHERE
    c.assigned_to IS NULL
    AND c.queue_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.contact_id = c.id
        AND m.created_at > now() - interval '30 days'
    )
),
queue_agents AS (
  SELECT
    qm.queue_id,
    qm.profile_id AS agent_id,
    ROW_NUMBER() OVER(PARTITION BY qm.queue_id ORDER BY qm.profile_id) - 1 AS agent_idx,
    count(*) OVER(PARTITION BY qm.queue_id) AS agents_in_queue
  FROM public.queue_members qm
  JOIN public.profiles p    ON p.id = qm.profile_id
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE qm.is_active = true
    AND p.is_active  = true
    AND ur.role      = 'agent'
)
UPDATE public.contacts c
SET assigned_to = qa.agent_id
FROM ranked_contacts rc
JOIN queue_agents qa ON qa.queue_id = rc.queue_id
  AND qa.agent_idx = (rc.rn_in_queue % qa.agents_in_queue)
WHERE c.id = rc.id
  AND c.assigned_to IS NULL    -- TOCTOU guard: não sobrescreve assignment concorrente
  AND qa.agents_in_queue > 0;  -- guard: divisão por zero se fila sem agents
