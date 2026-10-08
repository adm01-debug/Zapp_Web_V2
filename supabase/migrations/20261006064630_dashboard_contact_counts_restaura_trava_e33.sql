-- dashboard_contact_counts_restaura_trava_e33
-- Rollback: create or replace function public.dashboard_contact_counts(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone, p_queue uuid DEFAULT NULL::uuid, p_agent uuid DEFAULT NULL::uuid) returns jsonb language sql stable as $function$ WITH filtered AS (SELECT c.id, c.queue_id, c.assigned_to, c.conversation_status FROM contacts c WHERE (p_queue IS NULL OR c.queue_id = p_queue) AND (p_agent IS NULL OR c.assigned_to = p_agent) AND (p_since IS NULL OR c.updated_at >= p_since) AND (p_until IS NULL OR c.updated_at <= p_until) AND c.deleted_at IS NULL), sla_today AS (SELECT s.contact_id, s.first_message_at, s.first_response_at, s.first_response_breached FROM conversation_sla s WHERE s.first_message_at >= date_trunc('day', now())), per_queue AS (SELECT f.queue_id, count(*) FILTER (WHERE f.assigned_to IS NULL) AS waiting, count(*) FILTER (WHERE f.assigned_to IS NOT NULL) AS in_service, round((avg(EXTRACT(EPOCH FROM (st.first_response_at - st.first_message_at))) FILTER (WHERE st.first_response_at IS NOT NULL))::numeric) AS avg_response, round((100.0 * count(*) FILTER (WHERE st.first_response_breached IS FALSE) / NULLIF(count(*) FILTER (WHERE st.contact_id IS NOT NULL), 0))::numeric) AS sla_rate FROM filtered f LEFT JOIN sla_today st ON st.contact_id = f.id WHERE f.queue_id IS NOT NULL GROUP BY f.queue_id) SELECT jsonb_build_object('total', (SELECT count(*) FROM filtered), 'open', (SELECT count(*) FROM filtered WHERE assigned_to IS NOT NULL AND conversation_status = 'open'), 'pending', (SELECT count(*) FROM filtered WHERE assigned_to IS NULL AND queue_id IS NOT NULL AND conversation_status NOT IN ('resolved', 'archived')), 'myActive', (SELECT count(*) FROM filtered WHERE assigned_to = auth.uid()), 'queues', COALESCE((SELECT jsonb_agg(jsonb_build_object('queueId', queue_id, 'waiting', waiting, 'inService', in_service, 'avgResponse', avg_response, 'slaRate', sla_rate)) FROM per_queue), '[]'::jsonb)); $function$;
-- DASH-SQL-REGRESSION-001 (P1, item 38 do BACKLOG_VERIFICADO). A migration
-- 20260930400000_dashboard_contact_counts_filter_deleted_at (#1371) copiou o corpo
-- INICIAL da RPC (20260925162737) e só acrescentou `deleted_at IS NULL`. Com isso
-- reintroduziu, sobre a correção de 20260925221406:
--   a) `p_agent` cru (sem a trava E33) — agente comum recebia a contagem de outro
--      agente ao passar p_agent apontando para ele (spoof), e `myActive` comparava
--      auth.uid() (= profiles.user_id) com contacts.assigned_to (= profiles.id),
--      espaços de UUID distintos: a contagem pessoal podia zerar;
--   b) perdeu o guard de staff (`is_admin_or_supervisor`) e a resolução efetiva de
--      p_agent (`get_profile_id_for_user`);
--   c) perdeu `SET search_path TO 'public'`;
--   d) `sla_today` voltou a `date_trunc('day', now())` (dia civil em UTC, 3h
--      adiantado em relação a America/Sao_Paulo) e sem honrar p_since/p_until;
--   e) `LEFT JOIN conversation_sla` sem pré-agregação: contato com mais de uma
--      linha de SLA no dia multiplica as linhas de `filtered` no fan-out por fila
--      e infla waiting/in_service.
-- Este arquivo restaura o corpo correto (o de 20260925221406, verbatim) PRESERVANDO
-- o único ganho do #1371, que é o filtro `c.deleted_at IS NULL` — contatos
-- soft-deletados continuam fora do total do dashboard (coberto pelas asserções
-- C8/B1 de scripts/db-audit/dashboard-rls-authorization.test.sh).
-- Escopo: só esta RPC. `dashboard_kpi` e `dashboard_hourly_volume` não têm
-- regressão e não são tocadas. Assinatura (4 parâmetros: nomes, tipos, ordem e
-- defaults) e ACLs são idênticas às vigentes: CREATE OR REPLACE preserva
-- ownership/permissões, e os REVOKE de anon/PUBLIC seguem valendo
-- (20260926100134 e 20260926100302) — nenhum GRANT/REVOKE é emitido aqui.
--
-- Rollback (completo): reaplica o corpo vigente antes desta migration, ou seja o
-- corpo do #1371 (sem a trava E33, sem search_path, dia civil em UTC, p_agent cru):
--   create or replace function public.dashboard_contact_counts(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone, p_queue uuid DEFAULT NULL::uuid, p_agent uuid DEFAULT NULL::uuid) returns jsonb language sql stable as $function$ ... $function$;
-- (o texto integral está no cabeçalho `-- Rollback:` acima, pronto para executar).

CREATE OR REPLACE FUNCTION public.dashboard_contact_counts(
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL,
  p_queue uuid DEFAULT NULL,
  p_agent uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH effective AS MATERIALIZED (
    SELECT
      public.is_admin_or_supervisor(auth.uid()) AS is_staff,
      CASE WHEN public.is_admin_or_supervisor(auth.uid())
           THEN p_agent
           ELSE public.get_profile_id_for_user(auth.uid())
      END AS agent
  ),
  filtered AS (
    SELECT c.id, c.queue_id, c.assigned_to, c.conversation_status
    FROM contacts c, effective e
    WHERE (p_queue IS NULL OR c.queue_id = p_queue)
      AND ((e.is_staff AND e.agent IS NULL) OR c.assigned_to = e.agent)
      AND (p_since IS NULL OR c.updated_at >= p_since)
      AND (p_until IS NULL OR c.updated_at <= p_until)
      AND c.deleted_at IS NULL
  ),
  sla_today AS (
    SELECT DISTINCT ON (s.contact_id)
      s.contact_id, s.first_message_at, s.first_response_at, s.first_response_breached
    FROM conversation_sla s
    WHERE s.first_message_at >= COALESCE(p_since, (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')) AT TIME ZONE 'America/Sao_Paulo')
      AND (p_until IS NULL OR s.first_message_at <= p_until)
    ORDER BY s.contact_id, s.first_message_at DESC
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
    'myActive', (SELECT count(*) FROM filtered WHERE assigned_to = public.get_profile_id_for_user(auth.uid())),
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
$function$;
