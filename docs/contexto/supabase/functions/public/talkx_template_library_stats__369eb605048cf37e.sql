CREATE OR REPLACE FUNCTION public.talkx_template_library_stats(p_days integer DEFAULT 30, p_top integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days      integer     := GREATEST(1, COALESCE(p_days, 30));
  v_top       integer     := GREATEST(1, LEAST(COALESCE(p_top, 3), 20));
  v_now       timestamptz := now();
  v_cur_from  timestamptz;
  v_prev_from timestamptz;
  v_result    jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  v_cur_from  := v_now - make_interval(days => v_days);
  v_prev_from := v_now - make_interval(days => v_days * 2);

  WITH meses AS (
    SELECT date_trunc('month', v_now) - make_interval(months => g) AS ini,
           date_trunc('month', v_now) - make_interval(months => g - 1) AS fim,
           7 - g AS ord
    FROM generate_series(7, 0, -1) AS g
  ),
  vivos AS (
    SELECT * FROM public.talkx_templates WHERE archived_at IS NULL
  ),
  envios AS (
    SELECT c.template_id,
           r.sent_at,
           r.replied_at
    FROM public.talkx_campaigns c
    JOIN public.talkx_recipients r ON r.campaign_id = c.id
    WHERE c.template_id IS NOT NULL
      AND r.sent_at IS NOT NULL
      AND r.sent_at >= LEAST(v_prev_from, date_trunc('month', v_now) - make_interval(months => 7))
  ),
  base_atual AS (
    SELECT COUNT(*) AS sent, COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS replied
    FROM envios WHERE sent_at >= v_cur_from
  ),
  base_anterior AS (
    SELECT COUNT(*) AS sent, COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS replied
    FROM envios WHERE sent_at >= v_prev_from AND sent_at < v_cur_from
  ),
  ranking AS (
    SELECT e.template_id, COUNT(*) AS messages
    FROM envios e
    WHERE e.sent_at >= v_cur_from
    GROUP BY e.template_id
    ORDER BY COUNT(*) DESC, e.template_id
    LIMIT v_top
  ),
  lider AS (
    SELECT r.template_id, r.messages, t.name
    FROM ranking r LEFT JOIN public.talkx_templates t ON t.id = r.template_id
    ORDER BY r.messages DESC, r.template_id
    LIMIT 1
  ),
  melhor_resposta AS (
    SELECT e.template_id,
           ROUND((COUNT(*) FILTER (WHERE e.replied_at IS NOT NULL)::numeric * 100) / COUNT(*), 1) AS taxa
    FROM envios e
    WHERE e.sent_at >= v_cur_from
    GROUP BY e.template_id
    HAVING COUNT(*) > 0
    ORDER BY 2 DESC, e.template_id
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM vivos),
    'created_current_month', (
      SELECT COUNT(*) FROM vivos
      WHERE created_at >= date_trunc('month', v_now)
    ),
    'created_previous_month', (
      SELECT COUNT(*) FROM vivos
      WHERE created_at >= date_trunc('month', v_now) - interval '1 month'
        AND created_at <  date_trunc('month', v_now)
    ),
    'created_series', (
      SELECT jsonb_agg(q.n ORDER BY q.ord)
      FROM (
        SELECT m.ord, (SELECT COUNT(*) FROM vivos v WHERE v.created_at >= m.ini AND v.created_at < m.fim) AS n
        FROM meses m
      ) q
    ),
    'approved', (SELECT COUNT(*) FROM vivos WHERE status = 'approved'),
    'approved_period', (
      SELECT COUNT(*) FROM vivos WHERE status = 'approved' AND updated_at >= v_cur_from
    ),
    'approved_previous_period', (
      SELECT COUNT(*) FROM vivos
      WHERE status = 'approved' AND updated_at >= v_prev_from AND updated_at < v_cur_from
    ),
    'approved_series', (
      SELECT jsonb_agg(q.n ORDER BY q.ord)
      FROM (
        SELECT m.ord, (
          SELECT COUNT(*) FROM vivos v
          WHERE v.status = 'approved' AND v.updated_at >= m.ini AND v.updated_at < m.fim
        ) AS n
        FROM meses m
      ) q
    ),
    'most_used', (
      SELECT jsonb_build_object(
        'name', l.name,
        'messages', l.messages,
        'series', (
          SELECT jsonb_agg(q.n ORDER BY q.ord)
          FROM (
            SELECT m.ord, (
              SELECT COUNT(*) FROM envios e
              WHERE e.template_id = l.template_id AND e.sent_at >= m.ini AND e.sent_at < m.fim
            ) AS n
            FROM meses m
          ) q
        )
      )
      FROM lider l
    ),
    'with_media', (SELECT COUNT(*) FROM vivos WHERE media_url IS NOT NULL),
    'with_media_series', (
      SELECT jsonb_agg(q.n ORDER BY q.ord)
      FROM (
        SELECT m.ord, (
          SELECT COUNT(*) FROM vivos v
          WHERE v.media_url IS NOT NULL AND v.created_at >= m.ini AND v.created_at < m.fim
        ) AS n
        FROM meses m
      ) q
    ),
    'avg_reply_rate_pct', (
      SELECT CASE WHEN sent > 0 THEN ROUND((replied::numeric * 100) / sent, 1) END FROM base_atual
    ),
    'avg_reply_rate_previous_pct', (
      SELECT CASE WHEN sent > 0 THEN ROUND((replied::numeric * 100) / sent, 1) END FROM base_anterior
    ),
    'reply_base_current', (SELECT sent FROM base_atual),
    'reply_base_previous', (SELECT sent FROM base_anterior),
    'best_reply', (
      SELECT jsonb_build_object(
        'name', t.name,
        'version', tv.version_number,
        'reply_rate_pct', mr.taxa
      )
      FROM melhor_resposta mr
      LEFT JOIN public.talkx_templates t ON t.id = mr.template_id
      LEFT JOIN public.talkx_template_versions tv ON tv.id = t.current_version_id
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$function$
