-- talkx_v16_time_series_sent_delivered
-- versão 20260930600000 reservada para hermes-talkx-fase1-v12-v21-2610011215c53b (hermes-db-migrar --nova)
-- rollback: recrie talkx_campaign_report com o FILTER antigo (status='sent') e
--           talkx_overview_stats com SUM(total_recipients) + série diária sem zero-fill
--           (corpos da 20260916190000 e 20260916180000, respectivamente).
--
-- V16 do PLANO_TALKX_V3_100_ETAPAS_2026-09-29 (P2-5).
-- (1) Série horária do relatório contava 'sent' como status='sent' EXATO, ignorando
--     que 'delivered' também foi enviado -> 3 sent + 2 delivered contavam 3 em vez de 5.
-- (2) contacts_reached somava total_recipients (duplica contatos em múltiplas campanhas)
--     -> passa a contar DISTINCT contact_id.
-- (3) Série diária não preenchia dias sem envio -> generate_series com zero-fill.
-- Classe: contrato (CREATE OR REPLACE FUNCTION) -> aplicada após o merge/deploy.

-- 1) talkx_campaign_report: série horária conta sent + delivered -------------------
CREATE OR REPLACE FUNCTION public.talkx_campaign_report(
  p_campaign uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.talkx_campaigns WHERE id = p_campaign) THEN
    RAISE EXCEPTION 'talkx_campaign_report: campanha % nao encontrada ou inacessivel', p_campaign
      USING ERRCODE = 'P0002';
  END IF;

  WITH camp AS (
    SELECT * FROM public.talkx_campaigns WHERE id = p_campaign
  ),
  kpis AS (
    SELECT
      c.total_recipients,
      c.sent_count,
      c.delivered_count,
      c.failed_count,
      c.outcome_unknown_count,
      ROUND(
        CASE WHEN c.sent_count > 0
          THEN c.delivered_count::numeric / c.sent_count * 100
          ELSE 0
        END, 1
      ) AS delivery_rate_pct,
      EXTRACT(EPOCH FROM (COALESCE(c.completed_at, NOW()) - c.started_at))::int AS duration_secs,
      (
        SELECT EXTRACT(EPOCH FROM AVG(r.replied_at - r.sent_at))::int
        FROM public.talkx_recipients r
        WHERE r.campaign_id = p_campaign
          AND r.replied_at IS NOT NULL
          AND r.sent_at IS NOT NULL
      ) AS avg_reply_secs
    FROM camp c
  ),
  hourly AS (
    SELECT
      date_trunc('hour', r.sent_at)                 AS hour,
      COUNT(*) FILTER (WHERE r.status IN ('sent','delivered')) AS sent,
      COUNT(*) FILTER (WHERE r.delivered_at IS NOT NULL) AS delivered
    FROM public.talkx_recipients r
    WHERE r.campaign_id = p_campaign AND r.sent_at IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  ),
  by_status AS (
    SELECT status, COUNT(*) AS cnt
    FROM public.talkx_recipients
    WHERE campaign_id = p_campaign
    GROUP BY 1
  ),
  by_variant AS (
    SELECT
      v.id         AS variant_id,
      v.label      AS variant_name,
      COUNT(r.id)  AS recipients,
      COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL) AS sent
    FROM public.talkx_recipients r
    LEFT JOIN public.talkx_template_variants v ON v.id = r.variant_id
    WHERE r.campaign_id = p_campaign
    GROUP BY v.id, v.label
  )
  SELECT jsonb_build_object(
    'campaign_id',  p_campaign,
    'kpis',         to_jsonb(kpis.*),
    'by_status',    (SELECT jsonb_object_agg(status, cnt) FROM by_status),
    'hourly_series',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.hour) FROM hourly h),
    'by_variant',   (SELECT jsonb_agg(to_jsonb(bv) ORDER BY bv.recipients DESC) FROM by_variant bv)
  ) INTO v_result
  FROM kpis;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'talkx_campaign_report: campanha % nao encontrada ou inacessivel', p_campaign
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$$;

-- 2) talkx_overview_stats: contacts_reached distinct + série diária zero-fill -------
CREATE OR REPLACE FUNCTION public.talkx_overview_stats(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_duration  interval := p_to - p_from;
  v_prev_from timestamptz := p_from - v_duration;

  v_curr      jsonb;
  v_prev      jsonb;
  v_by_status jsonb;
  v_daily     jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'talkx_overview_stats: p_from e p_to sao obrigatorios' USING ERRCODE = '22004';
  END IF;
  IF p_to <= p_from THEN
    RAISE EXCEPTION 'talkx_overview_stats: p_to precisa ser posterior a p_from' USING ERRCODE = '22007';
  END IF;

  SELECT jsonb_build_object(
    'campaigns',       COUNT(*),
    'contacts_reached', (
      SELECT COUNT(DISTINCT r.contact_id)
      FROM public.talkx_recipients r
      WHERE r.sent_at >= p_from AND r.sent_at < p_to
    ),
    'sent',            COALESCE(SUM(sent_count), 0),
    'delivered',       COALESCE(SUM(delivered_count), 0),
    'failed',          COALESCE(SUM(failed_count), 0),
    'unknown',         COALESCE(SUM(outcome_unknown_count), 0),
    'completed',       COUNT(*) FILTER (WHERE status = 'completed'),
    'active',          COUNT(*) FILTER (WHERE status IN ('running','paused')),
    'delivery_rate_pct', ROUND(
      CASE WHEN SUM(sent_count) > 0
        THEN SUM(delivered_count)::numeric / SUM(sent_count) * 100
        ELSE 0
      END, 1
    )
  ) INTO v_curr
  FROM public.talkx_campaigns
  WHERE created_at >= p_from AND created_at < p_to;

  SELECT jsonb_build_object(
    'campaigns',       COUNT(*),
    'contacts_reached', (
      SELECT COUNT(DISTINCT r.contact_id)
      FROM public.talkx_recipients r
      WHERE r.sent_at >= v_prev_from AND r.sent_at < p_from
    ),
    'sent',            COALESCE(SUM(sent_count), 0),
    'delivery_rate_pct', ROUND(
      CASE WHEN SUM(sent_count) > 0
        THEN SUM(delivered_count)::numeric / SUM(sent_count) * 100
        ELSE 0
      END, 1
    )
  ) INTO v_prev
  FROM public.talkx_campaigns
  WHERE created_at >= v_prev_from AND created_at < p_from;

  SELECT jsonb_object_agg(status, cnt) INTO v_by_status
  FROM (
    SELECT status, COUNT(*) AS cnt
    FROM public.talkx_campaigns
    WHERE created_at >= p_from AND created_at < p_to
    GROUP BY status
  ) sub;

  -- Série diária com zero-fill (dias sem envio aparecem com 0).
  SELECT jsonb_agg(
    jsonb_build_object('day', d.day, 'sends', COALESCE(s.cnt, 0))
    ORDER BY d.day
  ) INTO v_daily
  FROM generate_series(
    date_trunc('day', p_from),
    date_trunc('day', p_to) - interval '1 day',
    interval '1 day'
  ) d(day)
  LEFT JOIN (
    SELECT date_trunc('day', sent_at) AS day, COUNT(*) AS cnt
    FROM public.talkx_recipients
    WHERE sent_at >= p_from AND sent_at < p_to
    GROUP BY 1
  ) s ON s.day = d.day;

  RETURN jsonb_build_object(
    'period',       jsonb_build_object('from', p_from, 'to', p_to),
    'current',      v_curr,
    'previous',     v_prev,
    'by_status',    COALESCE(v_by_status, '{}'::jsonb),
    'daily_sends',  COALESCE(v_daily, '[]'::jsonb)
  );
END;
$$;
