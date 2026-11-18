CREATE OR REPLACE FUNCTION public.dashboard_kpi(p_since timestamp with time zone DEFAULT (now() - '1 day'::interval), p_queue uuid DEFAULT NULL::uuid, p_agent uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today     date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_yesterday date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1;
  v_is_staff  boolean := public.is_admin_or_supervisor(auth.uid());
  v_result    jsonb;
BEGIN
  IF NOT v_is_staff THEN
    p_agent := public.get_profile_id_for_user(auth.uid());
  END IF;

  WITH closures AS (
    SELECT
      (cc.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
      extract(hour FROM cc.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
      cc.contact_id
    FROM public.conversation_closures cc
    JOIN public.contacts ct ON ct.id = cc.contact_id
    WHERE (p_since IS NULL OR cc.created_at >= p_since)
      AND (p_queue IS NULL OR ct.queue_id = p_queue)
      AND ((v_is_staff AND p_agent IS NULL) OR ct.assigned_to = p_agent)
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
    WHERE (p_since IS NULL OR cs.first_message_at >= p_since)
      AND (p_queue IS NULL OR ct.queue_id = p_queue)
      AND ((v_is_staff AND p_agent IS NULL) OR ct.assigned_to = p_agent)
  ),
  resolved_hourly AS (
    -- Varios encerramentos do MESMO contato no mesmo dia contam UMA vez, no
    -- horario do primeiro do dia: era exatamente o que o indice unico diario
    -- (removido nesta migration) garantia para os indicadores.
    SELECT least(7, hour / 3) AS bucket, count(*) AS c
    FROM (
      SELECT DISTINCT ON (contact_id) hour
      FROM closures
      WHERE day = v_today
      ORDER BY contact_id, hour
    ) AS first_closure_of_day
    GROUP BY 1
  ),
  answered_today AS (
    SELECT response_seconds
    FROM sla_rows
    WHERE day = v_today AND first_response_at IS NOT NULL
  ),
  answered_yesterday AS (
    SELECT response_seconds
    FROM sla_rows
    WHERE day = v_yesterday AND first_response_at IS NOT NULL
  ),
  response_hourly AS (
    SELECT least(7, hour / 3) AS bucket, avg(response_seconds) AS avg_s
    FROM sla_rows
    WHERE day = v_today AND first_response_at IS NOT NULL
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'resolvedToday',        (SELECT count(DISTINCT contact_id) FROM closures WHERE day = v_today),
    'resolvedYesterday',    (SELECT count(DISTINCT contact_id) FROM closures WHERE day = v_yesterday),
    'resolvedHourly8',      (SELECT jsonb_agg(coalesce(rh.c, 0) ORDER BY g.b)
                              FROM generate_series(0, 7) g(b)
                              LEFT JOIN resolved_hourly rh ON rh.bucket = g.b),
    'avgResponseToday',     (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int
                              FROM answered_today),
    'avgResponseYesterday', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int
                              FROM answered_yesterday),
    'p90ResponseToday',     (SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY response_seconds))::int
                              FROM answered_today),
    'responseHourly8',      (SELECT jsonb_agg(round(coalesce(rh.avg_s, 0))::int ORDER BY g.b)
                              FROM generate_series(0, 7) g(b)
                              LEFT JOIN response_hourly rh ON rh.bucket = g.b),
    'slaBreachedToday',     (SELECT count(*) FROM sla_rows WHERE day = v_today AND first_response_breached IS TRUE),
    'answeredTodayCount',   (SELECT count(*) FROM answered_today),
    'answeredYesterdayCount', (SELECT count(*) FROM answered_yesterday)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
