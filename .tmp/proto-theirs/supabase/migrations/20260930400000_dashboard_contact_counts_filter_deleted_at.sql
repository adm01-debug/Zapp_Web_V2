-- dashboard_contact_counts_filter_deleted_at
-- versão 20260930400000 reservada para hermes-contatos-kpi-softdelete-2610010732dad9 em 2026-10-01T08:03:00-03:00 (hermes-db-migrar --nova)
-- Classe: contrato (CREATE OR REPLACE FUNCTION) — o hermes-tarefa-mergear aplica logo após merge + deploy.
-- Por quê: a RPC dashboard_contact_counts (dashboard E24/E25) contava contatos SEM filtrar
--   deleted_at, então soft-deletados inflavam o total do dashboard. A RPC irmã
--   contacts_count_by_type já filtra (migration 20260929370000); aqui fecha o mesmo gap na
--   leitura do dashboard, alinhado ao desenho "excluídos saem de todas as leituras do módulo".
-- NÃO toca RLS (is_contact_visible_to_user / contacts_select_policy): esse filtro foi
--   explicitamente adiado como decisão de produto (migration 20260930170000, linhas 81-88).
-- rollback: re-aplicar o CREATE OR REPLACE FUNCTION anterior (sem `AND c.deleted_at IS NULL`),
--   corpo idêntico ao de supabase/migrations/20260925162737_dashboard_fase3_contact_counts_rpc.sql.

CREATE OR REPLACE FUNCTION public.dashboard_contact_counts(
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL,
  p_queue uuid DEFAULT NULL,
  p_agent uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $body$
  WITH filtered AS (
    SELECT c.id, c.queue_id, c.assigned_to, c.conversation_status
    FROM contacts c
    WHERE (p_queue IS NULL OR c.queue_id = p_queue)
      AND (p_agent IS NULL OR c.assigned_to = p_agent)
      AND (p_since IS NULL OR c.updated_at >= p_since)
      AND (p_until IS NULL OR c.updated_at <= p_until)
      AND c.deleted_at IS NULL
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
$body$;
