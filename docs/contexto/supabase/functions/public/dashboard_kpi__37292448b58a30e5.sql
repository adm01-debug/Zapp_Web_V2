CREATE OR REPLACE FUNCTION public.dashboard_kpi(p_from timestamp with time zone, p_until timestamp with time zone, p_queue uuid DEFAULT NULL::uuid, p_agent uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_day_start  timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_is_staff   boolean     := public.is_admin_or_supervisor(auth.uid());
  v_from       timestamptz := coalesce(p_from, v_day_start);
  v_until      timestamptz := p_until;
  v_len        interval    := CASE WHEN v_until IS NOT NULL THEN v_until - v_from ELSE greatest(now() - v_from, interval '0') END;
  v_prev_from  timestamptz := v_from - v_len;
  v_prev_until timestamptz := v_from;
  v_result     jsonb;
BEGIN
  IF NOT v_is_staff THEN p_agent := public.get_profile_id_for_user(auth.uid()); END IF;
  WITH closures AS (
    SELECT cc.created_at, cc.contact_id, (cc.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS sp_day, extract(hour FROM cc.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS sp_hour
    FROM public.conversation_closures cc JOIN public.contacts ct ON ct.id = cc.contact_id
    WHERE (p_queue IS NULL OR ct.queue_id = p_queue) AND ((v_is_staff AND p_agent IS NULL) OR ct.assigned_to = p_agent)
      AND cc.created_at >= v_prev_from AND (v_until IS NULL OR cc.created_at < v_until)
  ),
  current_closures AS (SELECT * FROM closures WHERE created_at >= v_from AND (v_until IS NULL OR created_at < v_until)),
  prev_closures AS (SELECT * FROM closures WHERE created_at >= v_prev_from AND created_at < v_prev_until),
  sla_rows AS (
    SELECT cs.first_message_at, cs.first_response_at, extract(epoch FROM (cs.first_response_at - cs.first_message_at)) AS response_seconds, cs.first_response_breached
    FROM public.conversation_sla cs JOIN public.contacts ct ON ct.id = cs.contact_id
    WHERE (p_queue IS NULL OR ct.queue_id = p_queue) AND ((v_is_staff AND p_agent IS NULL) OR ct.assigned_to = p_agent)
      AND cs.first_message_at >= v_prev_from AND (v_until IS NULL OR cs.first_message_at < v_until)
  ),
  current_sla AS (SELECT * FROM sla_rows WHERE first_message_at >= v_from AND (v_until IS NULL OR first_message_at < v_until)),
  prev_sla AS (SELECT * FROM sla_rows WHERE first_message_at >= v_prev_from AND first_message_at < v_prev_until),
  resolved_hourly AS (
    SELECT least(7, hour / 3) AS bucket, count(*) AS c
    FROM (SELECT DISTINCT ON (contact_id, sp_day) sp_hour AS hour FROM current_closures ORDER BY contact_id, sp_day, sp_hour) AS first_closure_of_day
    GROUP BY 1
  ),
  response_hourly AS (
    SELECT least(7, extract(hour FROM first_message_at AT TIME ZONE 'America/Sao_Paulo')::int / 3) AS bucket, avg(response_seconds) AS avg_s
    FROM current_sla WHERE first_response_at IS NOT NULL GROUP BY 1
  )
  SELECT jsonb_build_object(
    'resolvedToday', (SELECT count(DISTINCT contact_id) FROM current_closures),
    'resolvedYesterday', (SELECT count(DISTINCT contact_id) FROM prev_closures),
    'resolvedHourly8', (SELECT jsonb_agg(coalesce(rh.c, 0) ORDER BY g.b) FROM generate_series(0, 7) g(b) LEFT JOIN resolved_hourly rh ON rh.bucket = g.b),
    'avgResponseToday', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int FROM current_sla WHERE first_response_at IS NOT NULL),
    'avgResponseYesterday', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int FROM prev_sla WHERE first_response_at IS NOT NULL),
    'p90ResponseToday', (SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY response_seconds))::int FROM current_sla WHERE first_response_at IS NOT NULL),
    'responseHourly8', (SELECT jsonb_agg(round(coalesce(rh.avg_s, 0))::int ORDER BY g.b) FROM generate_series(0, 7) g(b) LEFT JOIN response_hourly rh ON rh.bucket = g.b),
    'slaBreachedToday', (SELECT count(*) FROM current_sla WHERE first_response_breached IS TRUE),
    'answeredTodayCount', (SELECT count(*) FROM current_sla WHERE first_response_at IS NOT NULL),
    'answeredYesterdayCount', (SELECT count(*) FROM prev_sla WHERE first_response_at IS NOT NULL)
  ) INTO v_result;
  RETURN v_result;
END;
$function$
