-- X074 (Fase 7 · analíticas · banco): talkx_campaign_heatmap, talkx_top_segments, talkx_campaign_ranking.
-- Três RPCs read-only de SECURITY DEFINER; exigem dono da campanha ou admin/supervisor.
-- rollback:
--   DROP FUNCTION IF EXISTS public.talkx_campaign_heatmap(uuid);
--   DROP FUNCTION IF EXISTS public.talkx_top_segments(int);
--   DROP FUNCTION IF EXISTS public.talkx_campaign_ranking(int, text);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. talkx_campaign_heatmap: grade hora-do-dia × dia-da-semana (America/Sao_Paulo)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.talkx_campaign_heatmap(uuid);
CREATE OR REPLACE FUNCTION public.talkx_campaign_heatmap(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_tz         text := 'America/Sao_Paulo';
  v_result     jsonb;
BEGIN
  v_profile_id := (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1);
  IF NOT EXISTS (
    SELECT 1 FROM public.talkx_campaigns c
    WHERE c.id = p_campaign_id
      AND (c.created_by = v_profile_id OR public.is_admin_or_supervisor(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'campaign_id', p_campaign_id,
    'tz',          v_tz,
    'cells', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'dow',       dow,
          'hour',      hour,
          'sent',      sent,
          'delivered', delivered,
          'replied',   replied
        ) ORDER BY dow, hour
      ),
      '[]'::jsonb
    )
  ) INTO v_result
  FROM (
    SELECT
      EXTRACT(DOW  FROM sent_at AT TIME ZONE v_tz)::int  AS dow,
      EXTRACT(HOUR FROM sent_at AT TIME ZONE v_tz)::int  AS hour,
      COUNT(*)                                            AS sent,
      COUNT(*) FILTER (WHERE delivered_at IS NOT NULL)   AS delivered,
      COUNT(*) FILTER (WHERE replied_at   IS NOT NULL)   AS replied
    FROM public.talkx_recipients
    WHERE campaign_id = p_campaign_id
      AND sent_at IS NOT NULL
    GROUP BY dow, hour
  ) sub;

  RETURN COALESCE(v_result, jsonb_build_object(
    'campaign_id', p_campaign_id,
    'tz',          v_tz,
    'cells',       '[]'::jsonb
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.talkx_campaign_heatmap(uuid) TO authenticated;
COMMENT ON FUNCTION public.talkx_campaign_heatmap(uuid) IS
  'X074: grade hora-do-dia (0–23) × dia-da-semana (0=Dom … 6=Sáb) com contagens de envio/entrega/resposta para uma campanha.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. talkx_top_segments: top segmentos por taxa de resposta (últimos 90 dias)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.talkx_top_segments(int);
CREATE OR REPLACE FUNCTION public.talkx_top_segments(
  p_limit int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - interval '90 days';
  v_result jsonb;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY avg_reply_rate_pct DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      jsonb_build_object(
        'segment_id',            cm.segment_id,
        'segment_name',          s.name,
        'campaign_count',        COUNT(*),
        'total_recipients',      SUM(cm.total_recipients),
        'avg_delivery_rate_pct', ROUND(AVG(cm.delivery_rate_pct)::numeric, 1),
        'avg_reply_rate_pct',    ROUND(AVG(cm.reply_rate_pct)::numeric, 1)
      ) AS row,
      ROUND(AVG(cm.reply_rate_pct)::numeric, 1) AS avg_reply_rate_pct
    FROM public.talkx_campaign_metrics cm
    LEFT JOIN public.talkx_segments s ON s.id = cm.segment_id
    WHERE cm.completed_at >= v_cutoff
      AND cm.segment_id IS NOT NULL
    GROUP BY cm.segment_id, s.name
    ORDER BY avg_reply_rate_pct DESC
    LIMIT LEAST(p_limit, 50)
  ) sub;

  RETURN jsonb_build_object(
    'window_days', 90,
    'as_of',       now(),
    'segments',    v_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.talkx_top_segments(int) TO authenticated;
COMMENT ON FUNCTION public.talkx_top_segments(int) IS
  'X074: top segmentos por taxa de resposta média em campanhas concluídas nos últimos 90 dias (apenas admin/supervisor).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. talkx_campaign_ranking: ranking de campanhas por métrica
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.talkx_campaign_ranking(int, text);
CREATE OR REPLACE FUNCTION public.talkx_campaign_ranking(
  p_limit  int  DEFAULT 20,
  p_metric text DEFAULT 'reply_rate'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_cutoff     timestamptz := now() - interval '90 days';
  v_result     jsonb;
BEGIN
  v_profile_id := (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1);

  IF p_metric NOT IN ('reply_rate', 'delivery_rate', 'recipients', 'duration') THEN
    RAISE EXCEPTION 'invalid metric: %', p_metric USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY score DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      jsonb_build_object(
        'campaign_id',       cm.campaign_id,
        'campaign_name',     cm.campaign_name,
        'total_recipients',  cm.total_recipients,
        'delivery_rate_pct', cm.delivery_rate_pct,
        'reply_rate_pct',    cm.reply_rate_pct,
        'duration_secs',     cm.duration_secs,
        'completed_at',      cm.completed_at
      ) AS row,
      CASE p_metric
        WHEN 'reply_rate'    THEN cm.reply_rate_pct
        WHEN 'delivery_rate' THEN cm.delivery_rate_pct
        WHEN 'recipients'    THEN cm.total_recipients::numeric
        WHEN 'duration'      THEN (-COALESCE(cm.duration_secs, 0))::numeric
      END AS score
    FROM public.talkx_campaign_metrics cm
    WHERE cm.completed_at >= v_cutoff
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR cm.campaign_id IN (
          SELECT id FROM public.talkx_campaigns
          WHERE created_by = v_profile_id
        )
      )
    ORDER BY score DESC
    LIMIT LEAST(p_limit, 100)
  ) sub;

  RETURN jsonb_build_object(
    'metric',      p_metric,
    'window_days', 90,
    'as_of',       now(),
    'campaigns',   v_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.talkx_campaign_ranking(int, text) TO authenticated;
COMMENT ON FUNCTION public.talkx_campaign_ranking(int, text) IS
  'X074: ranking de campanhas concluídas por métrica (reply_rate|delivery_rate|recipients|duration) nos últimos 90 dias.';
