-- E24/E25 (Fase 3 do dashboard): RPC de agregação de contatos, substitui o
-- fetch cru de `contacts` em useDashboardStats.ts (cap silencioso do
-- PostgREST em 1000 linhas — achado A11, 3.095+ contatos reais em produção)
-- e dá a useQueueHealth.ts um breakdown por fila calculado no servidor
-- (waiting/inService/avgResponse/slaRate), fechando o achado A10
-- (waitingCount hardcoded 0). SECURITY INVOKER (default) para respeitar
-- contacts_select_policy / conversation_sla_select_policy normalmente.
CREATE OR REPLACE FUNCTION public.dashboard_contact_counts(
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL,
  p_queue uuid DEFAULT NULL,
  p_agent uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT c.id, c.queue_id, c.assigned_to, c.conversation_status
    FROM contacts c
    WHERE (p_queue IS NULL OR c.queue_id = p_queue)
      AND (p_agent IS NULL OR c.assigned_to = p_agent)
      AND (p_since IS NULL OR c.updated_at >= p_since)
      AND (p_until IS NULL OR c.updated_at <= p_until)
  ),
  sla_today AS (
    SELECT s.contact_id, s.first_message_at, s.first_response_at, s.first_response_breached
    FROM conversation_sla s
    WHERE s.first_message_at >= date_trunc('day', now())
  ),
  per_queue AS (
    SELECT
      f.queue_id,
      count(*) FILTER (WHERE f.assigned_to IS NULL) AS waiting,
      count(*) FILTER (WHERE f.assigned_to IS NOT NULL) AS in_service,
      round((avg(EXTRACT(EPOCH FROM (st.first_response_at - st.first_message_at)))
             FILTER (WHERE st.first_response_at IS NOT NULL))::numeric) AS avg_response,
      round((100.0 * count(*) FILTER (WHERE st.first_response_breached IS FALSE)
             / NULLIF(count(*) FILTER (WHERE st.contact_id IS NOT NULL), 0))::numeric) AS sla_rate
    FROM filtered f
    LEFT JOIN sla_today st ON st.contact_id = f.id
    WHERE f.queue_id IS NOT NULL
    GROUP BY f.queue_id
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'open', (SELECT count(*) FROM filtered WHERE assigned_to IS NOT NULL AND conversation_status = 'open'),
    'pending', (SELECT count(*) FROM filtered WHERE assigned_to IS NULL AND queue_id IS NOT NULL AND conversation_status NOT IN ('resolved', 'archived')),
    'myActive', (SELECT count(*) FROM filtered WHERE assigned_to = auth.uid()),
    'queues', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'queueId', queue_id,
        'waiting', waiting,
        'inService', in_service,
        'avgResponse', avg_response,
        'slaRate', sla_rate
      ))
      FROM per_queue
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_contact_counts(timestamptz, timestamptz, uuid, uuid) TO authenticated;
