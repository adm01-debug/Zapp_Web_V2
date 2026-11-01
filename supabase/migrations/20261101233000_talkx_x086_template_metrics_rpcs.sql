-- X086 (Fase 7 · analíticas · banco): talkx_template_metrics, talkx_template_library_kpis.
-- Duas RPCs read-only de SECURITY DEFINER; exigem admin/supervisor.
-- rollback:
--   DROP FUNCTION IF EXISTS public.talkx_template_metrics(uuid);
--   DROP FUNCTION IF EXISTS public.talkx_template_library_kpis();

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. talkx_template_metrics: métricas de entrega/resposta de um template (90 dias)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.talkx_template_metrics(uuid);
CREATE OR REPLACE FUNCTION public.talkx_template_metrics(
  p_template_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff  timestamptz := now() - interval '90 days';
  v_result  jsonb;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'template_id',           p_template_id,
    'window_days',           90,
    'as_of',                 now(),
    'campaign_count',        COUNT(*),
    'total_recipients',      COALESCE(SUM(cm.total_recipients), 0),
    'avg_delivery_rate_pct', ROUND(COALESCE(AVG(cm.delivery_rate_pct), 0)::numeric, 1),
    'avg_reply_rate_pct',    ROUND(COALESCE(AVG(cm.reply_rate_pct), 0)::numeric, 1),
    'best_reply_rate_pct',   ROUND(COALESCE(MAX(cm.reply_rate_pct), 0)::numeric, 1),
    'avg_duration_secs',     ROUND(COALESCE(AVG(cm.duration_secs), 0)::numeric, 0)
  ) INTO v_result
  FROM public.talkx_campaign_metrics cm
  WHERE cm.template_id = p_template_id
    AND cm.completed_at >= v_cutoff;

  RETURN COALESCE(v_result, jsonb_build_object(
    'template_id',           p_template_id,
    'window_days',           90,
    'as_of',                 now(),
    'campaign_count',        0,
    'total_recipients',      0,
    'avg_delivery_rate_pct', 0,
    'avg_reply_rate_pct',    0,
    'best_reply_rate_pct',   0,
    'avg_duration_secs',     0
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.talkx_template_metrics(uuid) TO authenticated;
COMMENT ON FUNCTION public.talkx_template_metrics(uuid) IS
  'X086: métricas de entrega e resposta de um template nas campanhas concluídas nos últimos 90 dias (apenas admin/supervisor).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. talkx_template_library_kpis: KPIs globais da biblioteca de templates
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.talkx_template_library_kpis();
CREATE OR REPLACE FUNCTION public.talkx_template_library_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff       timestamptz := now() - interval '90 days';
  v_total        int;
  v_by_category  jsonb;
  v_top_used     jsonb;
  v_result       jsonb;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.talkx_templates
  WHERE status = 'active';

  SELECT COALESCE(jsonb_object_agg(category, cnt), '{}'::jsonb) INTO v_by_category
  FROM (
    SELECT COALESCE(category, 'sem_categoria') AS category, COUNT(*) AS cnt
    FROM public.talkx_templates
    WHERE status = 'active'
    GROUP BY category
  ) sub;

  SELECT COALESCE(jsonb_agg(row ORDER BY use_count DESC), '[]'::jsonb) INTO v_top_used
  FROM (
    SELECT
      jsonb_build_object(
        'template_id',        t.id,
        'template_name',      t.name,
        'category',           t.category,
        'use_count',          t.use_count,
        'avg_reply_rate_pct', ROUND(COALESCE(AVG(cm.reply_rate_pct), 0)::numeric, 1)
      ) AS row,
      t.use_count
    FROM public.talkx_templates t
    LEFT JOIN public.talkx_campaign_metrics cm
      ON cm.template_id = t.id AND cm.completed_at >= v_cutoff
    WHERE t.status = 'active'
    GROUP BY t.id, t.name, t.category, t.use_count
    ORDER BY t.use_count DESC
    LIMIT 5
  ) sub;

  RETURN jsonb_build_object(
    'as_of',       now(),
    'total_active', v_total,
    'by_category',  v_by_category,
    'top_used',     v_top_used
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.talkx_template_library_kpis() TO authenticated;
COMMENT ON FUNCTION public.talkx_template_library_kpis() IS
  'X086: KPIs globais da biblioteca de templates ativos — total, distribuição por categoria e top 5 por uso com taxa de resposta média (apenas admin/supervisor).';
