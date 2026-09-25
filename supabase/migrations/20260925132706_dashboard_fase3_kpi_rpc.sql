CREATE OR REPLACE FUNCTION public.dashboard_kpi(
  p_since timestamptz,
  p_queue uuid DEFAULT NULL,
  p_agent uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_yesterday date := (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1;
  v_result jsonb;
BEGIN
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
$$;

COMMENT ON FUNCTION public.dashboard_kpi(timestamptz, uuid, uuid) IS
  'Dashboard E23 (2026-09-25): agrega conversation_closures + conversation_sla (mediana/p90 via '
  'percentile_cont, buckets de 3h para os sparklines) desde p_since, com filtro opcional por fila '
  '(p_queue) e agente (p_agent), preparando E31/E33 (Fase 4). SECURITY INVOKER — respeita RLS de '
  'ambas as tabelas via join com contacts. Substitui os 2 fetches crus + agregação client-side de '
  'useDashboardKpi.ts.';

GRANT EXECUTE ON FUNCTION public.dashboard_kpi(timestamptz, uuid, uuid) TO authenticated;
