-- E24: Backfill de assigned_to para contatos ativos (atividade nos últimos 30 dias)
--
-- Contexto: após E23, 1045 contatos estavam em Fila Geral sem agente atribuído.
-- O trigger on_contact_queue_auto_assign cobre novos contatos (BEFORE INSERT),
-- mas os existentes precisam de atribuição retroativa.
--
-- Estratégia: round-robin entre agentes ativos (role='agent') ordenados por id,
-- apenas para contatos COM mensagens nos últimos 30 dias (726 contatos ativos).
-- Os 319 sem atividade recente ficam no pool — são orphans ou contatos históricos.
--
-- Executado em 2026-09-02; idempotente (WHERE assigned_to IS NULL protege).

WITH active_agents AS (
  SELECT p.id AS agent_id, ROW_NUMBER() OVER(ORDER BY p.id) - 1 AS agent_idx
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE p.is_active = true AND ur.role = 'agent'
),
agent_count AS (
  SELECT count(*) AS n FROM active_agents
),
ranked_contacts AS (
  SELECT
    c.id,
    ROW_NUMBER() OVER(ORDER BY c.id) - 1 AS rn
  FROM public.contacts c
  WHERE
    c.assigned_to IS NULL
    AND c.queue_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.contact_id = c.id
        AND m.created_at > now() - interval '30 days'
    )
)
UPDATE public.contacts c
SET assigned_to = a.agent_id
FROM ranked_contacts rc
JOIN active_agents a ON a.agent_idx = (rc.rn % (SELECT n FROM agent_count))
WHERE c.id = rc.id
  AND (SELECT n FROM agent_count) > 0;
