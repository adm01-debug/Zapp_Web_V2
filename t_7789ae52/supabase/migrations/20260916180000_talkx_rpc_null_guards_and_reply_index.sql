-- Auditoria 2026-09-16 (validacao das entregas E86/E88 do Talk X).

-- E22-class: reply_message_id (FK de talkx_recipients para messages, E88)
-- nao tinha indice de cobertura no lado filho -- tabela nova, zero custo
-- de lock agora, mas degrada com uso real (mesma classe ja corrigida para
-- 5 outras colunas em 20260916160000).
CREATE INDEX idx_talkx_recipients_reply_message_id ON public.talkx_recipients(reply_message_id);

-- talkx_overview_stats(p_from, p_to): sem guarda, NULL em qualquer parametro
-- produzia um relatorio "zerado" indistinguivel de "sem atividade real", e
-- p_to < p_from produzia janela de comparacao invertida sem aviso. Testado
-- ao vivo na auditoria: talkx_overview_stats(NULL, NULL) retornava
-- {"period":{"from":null,"to":null},"current":{"campaigns":0,...}} em vez
-- de erro.
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
    'contacts_reached',COALESCE(SUM(total_recipients), 0),
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
    'contacts_reached',COALESCE(SUM(total_recipients), 0),
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

  SELECT jsonb_agg(
    jsonb_build_object('day', day, 'sends', sends)
    ORDER BY day
  ) INTO v_daily
  FROM (
    SELECT date_trunc('day', sent_at) AS day, COUNT(*) AS sends
    FROM public.talkx_recipients
    WHERE sent_at >= p_from AND sent_at < p_to
    GROUP BY 1
  ) sub;

  RETURN jsonb_build_object(
    'period',       jsonb_build_object('from', p_from, 'to', p_to),
    'current',      v_curr,
    'previous',     v_prev,
    'by_status',    COALESCE(v_by_status, '{}'::jsonb),
    'daily_sends',  COALESCE(v_daily, '[]'::jsonb)
  );
END;
$$;

-- talkx_campaign_report(p_campaign): campanha inexistente ou fora do
-- alcance da RLS do chamador retornava NULL puro em vez de erro claro --
-- testado ao vivo com UUID zerado.
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
      EXTRACT(EPOCH FROM (COALESCE(c.completed_at, NOW()) - c.started_at))::int AS duration_secs
    FROM camp c
  ),
  hourly AS (
    SELECT
      date_trunc('hour', r.sent_at)                 AS hour,
      COUNT(*) FILTER (WHERE r.status = 'sent')     AS sent,
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
      v.variant_name,
      COUNT(r.id)  AS recipients,
      COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL) AS sent
    FROM public.talkx_recipients r
    LEFT JOIN public.campaign_ab_variants v ON v.id = r.variant_id AND v.campaign_id = p_campaign
    WHERE r.campaign_id = p_campaign
    GROUP BY v.id, v.variant_name
  )
  SELECT jsonb_build_object(
    'campaign_id',  p_campaign,
    'kpis',         to_jsonb(kpis.*),
    'by_status',    (SELECT jsonb_object_agg(status, cnt) FROM by_status),
    'hourly_series',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.hour) FROM hourly h),
    'by_variant',   (SELECT jsonb_agg(to_jsonb(bv) ORDER BY bv.recipients DESC) FROM by_variant bv)
  ) INTO v_result
  FROM kpis;

  RETURN v_result;
END;
$$;
