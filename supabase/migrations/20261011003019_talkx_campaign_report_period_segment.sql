-- talkx_campaign_report_period_segment (N-133)
-- Rollback: bloco `-- RB:` no fim do arquivo, extrair com grep/sed; derruba a multi-arg e recria a single-arg V17 + grants originais.
-- Avanco: troca a single-arg (uuid) pela multi-arg (p_campaign, p_from, p_to, p_granularity, p_segment), SECURITY INVOKER.
--   DROP da single-arg no MESMO arquivo: evita sobrecarga ambigua no PostgREST. Nada em src/functions chama a single-arg.
--   Permissoes da multi-arg: REVOKE ALL de PUBLIC e anon; GRANT so para authenticated + service_role.
--   Correcoes: conversoes pre-agregadas por recipient (JOIN direto multiplicava funil/serie) e segment_id validado (22023 claro).
--   Rollback executavel: `grep '^-- RB:' <arquivo> | sed -e 's/^-- RB://' -e 's/^ //'`; single-arg byte-identica a
--   20260930680000_talkx_v17_read_at.sql:104-184 + REVOKE/GRANT originais (20260916130000 + 20260927000001).

-- Criterio 1: a assinatura antiga sai no mesmo arquivo (sem ela o PostgREST
-- expoe duas sobrecargas e a chamada fica ambigua).
DROP FUNCTION IF EXISTS public.talkx_campaign_report(uuid);

CREATE OR REPLACE FUNCTION public.talkx_campaign_report(
  p_campaign uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_granularity text,
  p_segment jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_granularity text;
  v_segment_id uuid := NULL;
BEGIN
  -- Validate campaign exists and caller has access
  IF NOT EXISTS (
    SELECT 1 FROM public.talkx_campaigns WHERE id = p_campaign
  ) THEN
    RAISE EXCEPTION 'talkx_campaign_report: campanha % nao encontrada ou inacessivel', p_campaign
      USING ERRCODE = '22023';
  END IF;

  -- Validate granularity
  v_granularity := lower(coalesce(p_granularity, 'day'));
  IF v_granularity NOT IN ('hour', 'day', 'week', 'month') THEN
    RAISE EXCEPTION 'talkx_campaign_report: granularidade invalida %', p_granularity
      USING ERRCODE = '22023';
  END IF;

  -- Validate segment_id: cast direto estourava erro generico; agora 22023 claro.
  IF p_segment IS NOT NULL
     AND (p_segment ? 'segment_id')
     AND NULLIF(p_segment->>'segment_id', '') IS NOT NULL THEN
    BEGIN
      v_segment_id := (p_segment->>'segment_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'talkx_campaign_report: segment_id invalido %', p_segment->>'segment_id'
        USING ERRCODE = '22023';
    END;
  END IF;

  -- Build the time series
  WITH camp AS (
    SELECT * FROM public.talkx_campaigns WHERE id = p_campaign
  ),
  base_recipients AS (
    SELECT r.*
    FROM public.talkx_recipients r
    WHERE r.campaign_id = p_campaign
      AND r.sent_at IS NOT NULL
      AND r.sent_at >= p_from
      AND r.sent_at < p_to
      AND (v_segment_id IS NULL OR r.segment_id = v_segment_id)
  ),
  -- Um recipient com N conversoes gerava N linhas no JOIN direto e multiplicava
  -- funil/serie: pre-agrega por recipient (1 linha por recipient).
  conv AS (
    SELECT
      c.recipient_id AS recipient_id,
      COALESCE(SUM(c.value), 0) AS revenue
    FROM public.talkx_conversions c
    WHERE c.campaign_id = p_campaign
      AND c.occurred_at >= p_from
      AND c.occurred_at < p_to
    GROUP BY c.recipient_id
  ),
  time_series AS (
    SELECT
      date_trunc(v_granularity, b.sent_at) AS period_start,
      date_trunc(v_granularity, b.sent_at) +
        CASE v_granularity
          WHEN 'hour' THEN interval '1 hour'
          WHEN 'day' THEN interval '1 day'
          WHEN 'week' THEN interval '1 week'
          WHEN 'month' THEN interval '1 month'
        END AS period_end,
      COUNT(*) FILTER (WHERE b.status = 'sent') AS sent,
      COUNT(*) FILTER (WHERE b.status = 'delivered') AS delivered,
      COUNT(*) FILTER (WHERE b.read_at IS NOT NULL) AS opened,
      COUNT(*) FILTER (WHERE b.clicked_at IS NOT NULL) AS clicked,
      COUNT(*) FILTER (WHERE b.status = 'failed') AS bounced,
      0 AS unsubscribed,
      COUNT(*) FILTER (WHERE b.replied_at IS NOT NULL) AS replied,
      COALESCE(SUM(cv.revenue), 0) AS revenue
    FROM base_recipients b
    LEFT JOIN conv cv
      ON cv.recipient_id = b.id
    GROUP BY 1, 2
    ORDER BY 1
  ),
  funnel AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE b.status = 'sent') AS sent,
      COUNT(*) FILTER (WHERE b.status = 'delivered') AS delivered,
      COUNT(*) FILTER (WHERE b.read_at IS NOT NULL) AS opened,
      COUNT(*) FILTER (WHERE b.clicked_at IS NOT NULL) AS clicked,
      COUNT(*) FILTER (WHERE b.replied_at IS NOT NULL) AS replied,
      COUNT(*) FILTER (WHERE b.status = 'failed') AS bounced,
      0 AS unsubscribed,
      COALESCE(SUM(cv.revenue), 0) AS revenue
    FROM base_recipients b
    LEFT JOIN conv cv
      ON cv.recipient_id = b.id
  ),
  kpis AS (
    SELECT
      camp.total_recipients,
      camp.sent_count,
      camp.delivered_count,
      camp.failed_count,
      ROUND(
        CASE WHEN camp.sent_count > 0
          THEN camp.delivered_count::numeric / camp.sent_count * 100
          ELSE 0
        END, 1
      ) AS delivery_rate_pct,
      EXTRACT(EPOCH FROM (COALESCE(camp.completed_at, NOW()) - camp.started_at))::int AS duration_secs
    FROM camp
  )
  SELECT jsonb_build_object(
    'campaign_id', p_campaign,
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'granularity', v_granularity,
    'time_series', (SELECT jsonb_agg(to_jsonb(ts) ORDER BY ts.period_start) FROM time_series ts),
    'funnel', to_jsonb(f.*),
    'kpis', to_jsonb(k.*)
  ) INTO v_result
  FROM funnel f, kpis k;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'talkx_campaign_report: campanha % nao encontrada ou inacessivel', p_campaign
      USING ERRCODE = '22023';
  END IF;

  RETURN v_result;
END;
$$;

-- Ponto 1: funcao nova herda EXECUTE para PUBLIC por padrao; trava aqui.
REVOKE ALL ON FUNCTION public.talkx_campaign_report(uuid, timestamptz, timestamptz, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_report(uuid, timestamptz, timestamptz, text, jsonb) TO authenticated, service_role;

-- Rollback (SQL executavel: `grep '^-- RB:' <arquivo> | sed -e 's/^-- RB://' -e 's/^ //'`).
-- Derruba SOMENTE a multi-arg e recria a single-arg byte-identica a
-- 20260930680000_talkx_v17_read_at.sql:104-184 + REVOKE/GRANT originais.
-- RB: DROP FUNCTION IF EXISTS public.talkx_campaign_report(uuid, timestamptz, timestamptz, text, jsonb);
-- RB: CREATE OR REPLACE FUNCTION public.talkx_campaign_report(
-- RB:   p_campaign uuid
-- RB: )
-- RB: RETURNS jsonb
-- RB: LANGUAGE plpgsql
-- RB: STABLE
-- RB: SECURITY INVOKER
-- RB: SET search_path = public
-- RB: AS $$
-- RB: DECLARE
-- RB:   v_result jsonb;
-- RB: BEGIN
-- RB:   IF NOT EXISTS (SELECT 1 FROM public.talkx_campaigns WHERE id = p_campaign) THEN
-- RB:     RAISE EXCEPTION 'talkx_campaign_report: campanha % nao encontrada ou inacessivel', p_campaign
-- RB:       USING ERRCODE = 'P0002';
-- RB:   END IF;
-- RB:
-- RB:   WITH camp AS (
-- RB:     SELECT * FROM public.talkx_campaigns WHERE id = p_campaign
-- RB:   ),
-- RB:   kpis AS (
-- RB:     SELECT
-- RB:       c.total_recipients,
-- RB:       c.sent_count,
-- RB:       c.delivered_count,
-- RB:       c.read_count,
-- RB:       c.failed_count,
-- RB:       c.outcome_unknown_count,
-- RB:       ROUND(
-- RB:         CASE WHEN c.sent_count > 0
-- RB:           THEN c.delivered_count::numeric / c.sent_count * 100
-- RB:           ELSE 0
-- RB:         END, 1
-- RB:       ) AS delivery_rate_pct,
-- RB:       EXTRACT(EPOCH FROM (COALESCE(c.completed_at, NOW()) - c.started_at))::int AS duration_secs
-- RB:     FROM camp c
-- RB:   ),
-- RB:   hourly AS (
-- RB:     SELECT
-- RB:       date_trunc('hour', r.sent_at)                 AS hour,
-- RB:       COUNT(*) FILTER (WHERE r.status IN ('sent','delivered')) AS sent,
-- RB:       COUNT(*) FILTER (WHERE r.delivered_at IS NOT NULL) AS delivered
-- RB:     FROM public.talkx_recipients r
-- RB:     WHERE r.campaign_id = p_campaign AND r.sent_at IS NOT NULL
-- RB:     GROUP BY 1
-- RB:     ORDER BY 1
-- RB:   ),
-- RB:   by_status AS (
-- RB:     SELECT status, COUNT(*) AS cnt
-- RB:     FROM public.talkx_recipients
-- RB:     WHERE campaign_id = p_campaign
-- RB:     GROUP BY 1
-- RB:   ),
-- RB:   by_variant AS (
-- RB:     SELECT
-- RB:       v.id         AS variant_id,
-- RB:       v.label      AS variant_name,
-- RB:       COUNT(r.id)  AS recipients,
-- RB:       COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL) AS sent
-- RB:     FROM public.talkx_recipients r
-- RB:     LEFT JOIN public.talkx_template_variants v ON v.id = r.variant_id
-- RB:     WHERE r.campaign_id = p_campaign
-- RB:     GROUP BY v.id, v.label
-- RB:   )
-- RB:   SELECT jsonb_build_object(
-- RB:     'campaign_id',  p_campaign,
-- RB:     'kpis',         to_jsonb(kpis.*),
-- RB:     'by_status',    (SELECT jsonb_object_agg(status, cnt) FROM by_status),
-- RB:     'hourly_series',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.hour) FROM hourly h),
-- RB:     'by_variant',   (SELECT jsonb_agg(to_jsonb(bv) ORDER BY bv.recipients DESC) FROM by_variant bv)
-- RB:   ) INTO v_result
-- RB:   FROM kpis;
-- RB:
-- RB:   IF v_result IS NULL THEN
-- RB:     RAISE EXCEPTION 'talkx_campaign_report: campanha % nao encontrada ou inacessivel', p_campaign
-- RB:       USING ERRCODE = 'P0002';
-- RB:   END IF;
-- RB:
-- RB:   RETURN v_result;
-- RB: END;
-- RB: $$;
-- RB: REVOKE ALL ON FUNCTION public.talkx_campaign_report(uuid) FROM PUBLIC, anon;
-- RB: GRANT EXECUTE ON FUNCTION public.talkx_campaign_report(uuid) TO authenticated, service_role;
