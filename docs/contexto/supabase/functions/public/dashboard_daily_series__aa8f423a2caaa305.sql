CREATE OR REPLACE FUNCTION public.dashboard_daily_series(p_days integer DEFAULT 7)
 RETURNS TABLE(metric_date date, messages_received bigint, messages_sent bigint, new_contacts bigint, conversations_opened bigint, conversations_resolved bigint, active_contacts bigint, median_response_time_seconds numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_days      integer     := greatest(least(coalesce(p_days, 7), 90), 1);
  v_today     date        := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_start_day date        := v_today - (v_days - 1);
  v_end_day   date        := v_today + 1;
  v_start     timestamptz := (v_start_day::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_end       timestamptz := (v_end_day::timestamp AT TIME ZONE 'America/Sao_Paulo');
BEGIN
  IF NOT (public.is_admin_or_supervisor(auth.uid()) OR coalesce(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'dashboard_daily_series_requires_staff' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT generate_series(v_start_day, v_today, interval '1 day')::date AS dia
  ),
  recebidas AS (
    SELECT (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS c
    FROM public.messages m
    WHERE m.created_at >= v_start AND m.created_at < v_end
      AND m.sender = 'contact' AND m.is_deleted IS NOT TRUE
    GROUP BY 1
  ),
  enviadas AS (
    SELECT (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS c
    FROM public.messages m
    WHERE m.created_at >= v_start AND m.created_at < v_end
      AND m.sender = 'agent' AND m.is_deleted IS NOT TRUE
    GROUP BY 1
  ),
  ativos AS (
    SELECT (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           count(DISTINCT m.contact_id) AS c
    FROM public.messages m
    WHERE m.created_at >= v_start AND m.created_at < v_end
      AND m.contact_id IS NOT NULL AND m.is_deleted IS NOT TRUE
    GROUP BY 1
  ),
  abertas AS (
    SELECT (f.primeira AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS c
    FROM (
      SELECT m.contact_id, min(m.created_at) AS primeira
      FROM public.messages m
      WHERE m.created_at >= v_start AND m.created_at < v_end
        AND m.contact_id IS NOT NULL AND m.is_deleted IS NOT TRUE
      GROUP BY m.contact_id
    ) f
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.messages p
      WHERE p.contact_id = f.contact_id
        AND p.is_deleted IS NOT TRUE
        AND p.created_at < v_start
    )
    GROUP BY 1
  ),
  resolvidas AS (
    SELECT (cc.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           count(DISTINCT cc.contact_id) AS c
    FROM public.conversation_closures cc
    WHERE cc.created_at >= v_start AND cc.created_at < v_end
    GROUP BY 1
  ),
  novos AS (
    SELECT (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS c
    FROM public.contacts c
    WHERE c.created_at >= v_start AND c.created_at < v_end
      AND c.deleted_at IS NULL
    GROUP BY 1
  ),
  resposta AS (
    SELECT (s.first_message_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           round(percentile_cont(0.5) WITHIN GROUP (
             ORDER BY extract(epoch FROM (s.first_response_at - s.first_message_at))
           ))::numeric AS mediana
    FROM public.conversation_sla s
    WHERE s.first_message_at >= v_start AND s.first_message_at < v_end
      AND s.first_response_at IS NOT NULL
    GROUP BY 1
  )
  SELECT dias.dia,
         coalesce(r.c, 0)::bigint,
         coalesce(e.c, 0)::bigint,
         coalesce(n.c, 0)::bigint,
         coalesce(o.c, 0)::bigint,
         coalesce(rs.c, 0)::bigint,
         coalesce(a.c, 0)::bigint,
         m.mediana
  FROM dias
  LEFT JOIN recebidas  r  ON r.dia  = dias.dia
  LEFT JOIN enviadas   e  ON e.dia  = dias.dia
  LEFT JOIN novos      n  ON n.dia  = dias.dia
  LEFT JOIN abertas    o  ON o.dia  = dias.dia
  LEFT JOIN resolvidas rs ON rs.dia = dias.dia
  LEFT JOIN ativos     a  ON a.dia  = dias.dia
  LEFT JOIN resposta   m  ON m.dia  = dias.dia
  ORDER BY dias.dia;
END;
$function$
