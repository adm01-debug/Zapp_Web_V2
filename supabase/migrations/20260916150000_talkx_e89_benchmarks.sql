-- E89 · Métricas comparativas: view + RPC talkx_benchmarks

-- VIEW talkx_campaign_metrics (sempre atual; lê talkx_campaigns diretamente)
CREATE OR REPLACE VIEW public.talkx_campaign_metrics AS
SELECT
  c.id                                                                AS campaign_id,
  c.segment_id,
  c.template_id,
  c.status,
  c.total_recipients,
  c.sent_count,
  c.delivered_count,
  COALESCE(c.replied_count, 0)                                        AS replied_count,
  c.outcome_unknown_count,
  ROUND(
    CASE WHEN c.sent_count > 0
      THEN c.delivered_count::numeric / c.sent_count * 100 ELSE 0
    END, 1
  )                                                                   AS delivery_rate_pct,
  ROUND(
    CASE WHEN c.sent_count > 0
      THEN COALESCE(c.replied_count, 0)::numeric / c.sent_count * 100 ELSE 0
    END, 1
  )                                                                   AS reply_rate_pct,
  EXTRACT(EPOCH FROM (c.completed_at - c.started_at))::int           AS duration_secs,
  c.started_at,
  c.completed_at,
  c.created_at
FROM public.talkx_campaigns c
WHERE c.status = 'completed'
  AND c.started_at IS NOT NULL
  AND c.completed_at IS NOT NULL;

-- RPC talkx_benchmarks() — médias globais últimos 90 dias
CREATE OR REPLACE FUNCTION public.talkx_benchmarks()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cutoff  timestamptz := now() - interval '90 days';
  v_global  jsonb;
  v_by_seg  jsonb;
  v_by_tpl  jsonb;
BEGIN
  SELECT jsonb_build_object(
    'campaign_count',        COUNT(*),
    'avg_delivery_rate_pct', ROUND(AVG(delivery_rate_pct)::numeric, 1),
    'avg_reply_rate_pct',    ROUND(AVG(reply_rate_pct)::numeric, 1),
    'avg_duration_secs',     ROUND(AVG(duration_secs)::numeric),
    'p50_delivery_rate_pct', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY delivery_rate_pct))::numeric, 1),
    'p90_delivery_rate_pct', ROUND((PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY delivery_rate_pct))::numeric, 1),
    'avg_recipients',        ROUND(AVG(total_recipients)::numeric)
  ) INTO v_global
  FROM public.talkx_campaign_metrics
  WHERE completed_at >= v_cutoff;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'avg_reply_rate_pct')::numeric DESC), '[]'::jsonb)
  INTO v_by_seg
  FROM (
    SELECT jsonb_build_object(
      'segment_id',            segment_id,
      'campaign_count',        COUNT(*),
      'avg_delivery_rate_pct', ROUND(AVG(delivery_rate_pct)::numeric, 1),
      'avg_reply_rate_pct',    ROUND(AVG(reply_rate_pct)::numeric, 1)
    ) AS row
    FROM public.talkx_campaign_metrics
    WHERE completed_at >= v_cutoff AND segment_id IS NOT NULL
    GROUP BY segment_id ORDER BY AVG(reply_rate_pct) DESC LIMIT 5
  ) sub;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'avg_delivery_rate_pct')::numeric DESC), '[]'::jsonb)
  INTO v_by_tpl
  FROM (
    SELECT jsonb_build_object(
      'template_id',           template_id,
      'campaign_count',        COUNT(*),
      'avg_delivery_rate_pct', ROUND(AVG(delivery_rate_pct)::numeric, 1),
      'avg_reply_rate_pct',    ROUND(AVG(reply_rate_pct)::numeric, 1)
    ) AS row
    FROM public.talkx_campaign_metrics
    WHERE completed_at >= v_cutoff AND template_id IS NOT NULL
    GROUP BY template_id ORDER BY AVG(delivery_rate_pct) DESC LIMIT 5
  ) sub;

  RETURN jsonb_build_object(
    'window_days',  90,
    'as_of',        now(),
    'global',       COALESCE(v_global, '{}'::jsonb),
    'by_segment',   COALESCE(v_by_seg, '[]'::jsonb),
    'by_template',  COALESCE(v_by_tpl, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_benchmarks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.talkx_benchmarks() TO service_role, authenticated;
