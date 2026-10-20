-- Fase 4 do dashboard (E31/E32/E33): propaga fila/agente do filtro do topo
-- para dashboard_kpi (E31) e dashboard_hourly_volume (E32, ganha p_queue/p_agent
-- pela 1a vez) + trava server-side de p_agent para não-staff (E33) nas 3 RPCs
-- que aceitam esse parâmetro. Antes, showTeamFilters={isStaff} só escondia o
-- Select de agente no front (DashboardFilters.tsx) — nada impedia chamar a RPC
-- direto com outro p_agent. Agora, quem não é admin/supervisor (is_admin_or_supervisor)
-- sempre tem p_agent forçado para auth.uid(), independente do que for passado.
--
-- Já aplicada e verificada ao vivo em produção nesta sessão (25/09/2026), via
-- set_config('request.jwt.claims', ...) simulando um admin real e um agent
-- real: staff filtra por qualquer p_agent normalmente; agente comum que tenta
-- passar o id de outra pessoa recebe os próprios dados de volta (a trava
-- ignora o p_agent recebido). Sem regressão nos 3 RPCs para filtros NULL
-- (output idêntico ao pré-migração). Este arquivo registra a DDL já viva —
-- ledger (supabase_migrations.schema_migrations) já tem a entrada correspondente.

-- E31/E33: dashboard_kpi — trava p_agent no início da função (plpgsql).
CREATE OR REPLACE FUNCTION public.dashboard_kpi(p_since timestamp with time zone, p_queue uuid DEFAULT NULL::uuid, p_agent uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_yesterday date := (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    p_agent := auth.uid();
  END IF;

  WITH closures AS (
    SELECT
      (cc.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
      extract(hour FROM cc.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour
    FROM public.conversation_closures cc
    JOIN public.contacts ct ON ct.id = cc.contact_id
    WHERE cc.created_at >= p_since
      AND (p_queue IS NULL OR ct.queue_id = p_queue)
      AND (p_agent IS NULL OR ct.assigned_to = p_agent)
  ),
  sla_rows AS (
    SELECT
      (cs.first_message_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
      extract(hour FROM cs.first_message_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
      cs.first_response_at,
      extract(epoch FROM (cs.first_response_at - cs.first_message_at)) AS response_seconds,
      cs.first_response_breached
    FROM public.conversation_sla cs
    JOIN public.contacts ct ON ct.id = cs.contact_id
    WHERE cs.first_message_at >= p_since
      AND (p_queue IS NULL OR ct.queue_id = p_queue)
      AND (p_agent IS NULL OR ct.assigned_to = p_agent)
  ),
  resolved_hourly AS (
    SELECT least(7, hour / 3) AS bucket, count(*) AS c
    FROM closures WHERE day = v_today GROUP BY 1
  ),
  answered_today AS (
    SELECT response_seconds FROM sla_rows WHERE day = v_today AND first_response_at IS NOT NULL
  ),
  answered_yesterday AS (
    SELECT response_seconds FROM sla_rows WHERE day = v_yesterday AND first_response_at IS NOT NULL
  ),
  response_hourly AS (
    SELECT least(7, hour / 3) AS bucket, avg(response_seconds) AS avg_s
    FROM sla_rows WHERE day = v_today AND first_response_at IS NOT NULL GROUP BY 1
  )
  SELECT jsonb_build_object(
    'resolvedToday', (SELECT count(*) FROM closures WHERE day = v_today),
    'resolvedYesterday', (SELECT count(*) FROM closures WHERE day = v_yesterday),
    'resolvedHourly8', (SELECT jsonb_agg(coalesce(rh.c, 0) ORDER BY g.b)
                         FROM generate_series(0, 7) g(b) LEFT JOIN resolved_hourly rh ON rh.bucket = g.b),
    'avgResponseToday', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int FROM answered_today),
    'avgResponseYesterday', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int FROM answered_yesterday),
    'p90ResponseToday', (SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY response_seconds))::int FROM answered_today),
    'responseHourly8', (SELECT jsonb_agg(round(coalesce(rh.avg_s, 0))::int ORDER BY g.b)
                         FROM generate_series(0, 7) g(b) LEFT JOIN response_hourly rh ON rh.bucket = g.b),
    'slaBreachedToday', (SELECT count(*) FROM sla_rows WHERE day = v_today AND first_response_breached IS TRUE),
    'answeredTodayCount', (SELECT count(*) FROM answered_today),
    'answeredYesterdayCount', (SELECT count(*) FROM answered_yesterday)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- E33: dashboard_contact_counts — mesma trava, via CTE (função é LANGUAGE sql,
-- sem IF/BEGIN — CASE dentro de CTE resolve o mesmo efeito).
CREATE OR REPLACE FUNCTION public.dashboard_contact_counts(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone, p_queue uuid DEFAULT NULL::uuid, p_agent uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  WITH effective AS (
    SELECT CASE WHEN public.is_admin_or_supervisor(auth.uid()) THEN p_agent ELSE auth.uid() END AS agent
  ),
  filtered AS (
    SELECT c.id, c.queue_id, c.assigned_to, c.conversation_status
    FROM contacts c, effective e
    WHERE (p_queue IS NULL OR c.queue_id = p_queue)
      AND (e.agent IS NULL OR c.assigned_to = e.agent)
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
$function$;

-- E32/E33: dashboard_hourly_volume ganha p_queue/p_agent (DROP antes do CREATE
-- pra não virar overload) + join com contacts + trava de p_agent.
DROP FUNCTION IF EXISTS public.dashboard_hourly_volume(integer);

CREATE FUNCTION public.dashboard_hourly_volume(p_days integer DEFAULT 8, p_queue uuid DEFAULT NULL::uuid, p_agent uuid DEFAULT NULL::uuid)
 RETURNS TABLE(day date, hour integer, message_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH effective AS (
    SELECT CASE WHEN public.is_admin_or_supervisor(auth.uid()) THEN p_agent ELSE auth.uid() END AS agent
  )
  SELECT
    (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
    extract(hour FROM m.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
    count(*) AS message_count
  FROM public.messages m
  LEFT JOIN public.contacts ct ON ct.id = m.contact_id
  CROSS JOIN effective e
  WHERE m.created_at >= (
    date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
    - (make_interval(days => greatest(least(coalesce(p_days, 8), 31), 1) - 1))
  ) AT TIME ZONE 'America/Sao_Paulo'
    AND (p_queue IS NULL OR ct.queue_id = p_queue)
    AND (e.agent IS NULL OR ct.assigned_to = e.agent)
  GROUP BY 1, 2;
$function$;

GRANT EXECUTE ON FUNCTION public.dashboard_hourly_volume(integer, uuid, uuid) TO authenticated;
