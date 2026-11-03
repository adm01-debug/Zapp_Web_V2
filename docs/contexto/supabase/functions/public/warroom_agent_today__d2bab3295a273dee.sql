CREATE OR REPLACE FUNCTION public.warroom_agent_today(p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH guard AS (
    SELECT public.is_admin_or_supervisor(auth.uid()) AS is_staff
  ),
  win AS (
    SELECT COALESCE(p_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS d
  ),
  bounds AS (
    SELECT
      (w.d::timestamp AT TIME ZONE 'America/Sao_Paulo') AS t0,
      ((w.d + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS t1
    FROM win w
  ),
  sla_day AS (
    SELECT DISTINCT ON (s.contact_id)
      s.contact_id, s.first_message_at, s.first_response_at
    FROM public.conversation_sla s, bounds b
    WHERE s.first_message_at >= b.t0
      AND s.first_message_at < b.t1
    ORDER BY s.contact_id, s.first_message_at DESC
  ),
  agents AS (
    SELECT
      p.id,
      p.name,
      COALESCE(p.avatar_url, '') AS avatar,
      COALESCE(p.max_chats, 5) AS max_chats
    FROM public.profiles p
    WHERE p.is_active IS TRUE
  ),
  open_chats AS (
    -- Só o episódio aberto ocupa capacidade (resolvido/arquivado mantém `assigned_to`).
    SELECT c.assigned_to AS agent_id, count(*) AS n
    FROM public.contacts c
    WHERE c.assigned_to IS NOT NULL
      AND c.conversation_status = 'open'
      AND c.deleted_at IS NULL
    GROUP BY c.assigned_to
  ),
  resolved AS (
    -- Mesma regra do `dashboard_kpi`: DISTINCT contact_id (reabertura no mesmo dia não conta 2x).
    SELECT cc.closed_by AS agent_id, count(DISTINCT cc.contact_id) AS n
    FROM public.conversation_closures cc, bounds b
    WHERE cc.closed_by IS NOT NULL
      AND cc.created_at >= b.t0
      AND cc.created_at < b.t1
    GROUP BY cc.closed_by
  ),
  resp AS (
    SELECT
      c.assigned_to AS agent_id,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (sd.first_response_at - sd.first_message_at))
      ) AS median_seconds
    FROM sla_day sd
    JOIN public.contacts c ON c.id = sd.contact_id
    WHERE sd.first_response_at IS NOT NULL
      AND c.assigned_to IS NOT NULL
    GROUP BY c.assigned_to
  ),
  csat AS (
    SELECT
      cs.agent_id,
      round(100.0 * count(*) FILTER (WHERE cs.rating >= 4) / count(*)) AS satisfaction
    FROM public.csat_surveys cs, bounds b
    WHERE cs.created_at >= b.t0
      AND cs.created_at < b.t1
    GROUP BY cs.agent_id
  ),
  rows AS (
    SELECT
      a.id AS sort_id,
      a.name AS sort_name,
      jsonb_build_object(
        'id', a.id,
        'name', a.name,
        'avatar', a.avatar,
        'maxChats', a.max_chats,
        'activeChats', COALESCE(oc.n, 0),
        'resolvedToday', COALESCE(r.n, 0),
        'avgResponseTime', CASE WHEN rp.median_seconds IS NULL THEN NULL
                                ELSE round(rp.median_seconds)::integer END,
        'satisfaction', CASE WHEN cs.satisfaction IS NULL THEN NULL
                             ELSE cs.satisfaction::integer END
      ) AS row
    FROM agents a
    LEFT JOIN open_chats oc ON oc.agent_id = a.id
    LEFT JOIN resolved r ON r.agent_id = a.id
    LEFT JOIN resp rp ON rp.agent_id = a.id
    LEFT JOIN csat cs ON cs.agent_id = a.id
  )
  SELECT CASE
    WHEN (SELECT is_staff FROM guard)
      THEN COALESCE((SELECT jsonb_agg(row ORDER BY sort_name, sort_id) FROM rows), '[]'::jsonb)
    ELSE '[]'::jsonb
  END;
$function$
