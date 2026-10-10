-- talkx_campaign_report_period_segment
-- Rollback: remover a função multi-arg e recriar a assinatura antiga (single-arg)
DROP FUNCTION IF EXISTS public.talkx_campaign_report(uuid, timestamptz, timestamptz, text, jsonb);

CREATE OR REPLACE FUNCTION public.talkx_campaign_report(p_campaign uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.talkx_campaigns WHERE id = p_campaign) THEN
    RAISE EXCEPTION 'talkx_campaign_report: campanha % nao encontrada', p_campaign USING ERRCODE = 'P0002';
  END IF;
  WITH camp AS (SELECT * FROM public.talkx_campaigns WHERE id = p_campaign),
  kpis AS (
    SELECT c.total_recipients, c.sent_count, c.delivered_count, c.failed_count,
           c.outcome_unknown_count,
           ROUND(CASE WHEN c.sent_count > 0 THEN c.delivered_count::numeric/c.sent_count*100 ELSE 0 END,1) AS delivery_rate_pct,
           EXTRACT(EPOCH FROM (COALESCE(c.completed_at, NOW()) - c.started_at))::int AS duration_secs
    FROM camp c
  ),
  hourly AS (
    SELECT date_trunc('hour', r.sent_at) AS hour,
           COUNT(*) FILTER (WHERE r.status = 'sent') AS sent,
           COUNT(*) FILTER (WHERE r.delivered_at IS NOT NULL) AS delivered
    FROM public.talkx_recipients r
    WHERE r.campaign_id = p_campaign AND r.sent_at IS NOT NULL
    GROUP BY 1 ORDER BY 1
  ),
  by_status AS (SELECT status, COUNT(*) AS cnt FROM public.talkx_recipients WHERE campaign_id = p_campaign GROUP BY 1),
  by_variant AS (SELECT v.id AS variant_id, v.label AS variant_name, COUNT(r.id) AS recipients
                 FROM public.talkx_recipients r LEFT JOIN public.talkx_template_variants v ON v.id = r.variant_id
                 WHERE r.campaign_id = p_campaign GROUP BY v.id, v.label)
  SELECT jsonb_build_object('hourly_series',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.hour) FROM hourly h)) INTO v_result FROM kpis;
  RETURN v_result;
END;
$$;

