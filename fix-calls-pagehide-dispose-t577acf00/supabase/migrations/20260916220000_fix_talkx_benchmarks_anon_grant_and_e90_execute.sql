-- CRITICO -- auditoria multi-agente 2026-09-16 (2a rodada, E90 + regressao).
-- talkx_benchmarks() (minha propria correcao em 20260916190000, que a tornou
-- SECURITY DEFINER) e record_talkx_link_click() (E90) foram criadas com
-- REVOKE ALL ... FROM PUBLIC, mas isso NAO revoga um GRANT default de schema
-- concedido diretamente a anon/authenticated na criacao do objeto -- gotcha
-- classico do Supabase, ja corrigido 3x antes neste mesmo repo (migrations
-- revoke_is_account_locked_from_anon, fix_is_account_locked_anon_grant,
-- revoke_anon_record_failed_login). Confirmado ao vivo via aclexplode(proacl):
-- anon tinha EXECUTE nas duas funcoes.
--
-- Para talkx_benchmarks() isso e grave: como a funcao e SECURITY DEFINER,
-- nao ha RLS de talkx_campaigns como rede de seguranca -- qualquer requisicao
-- REST com a anon key publica (embutida em todo bundle do front) conseguia
-- puxar metricas de 90 dias da organizacao inteira sem login.
REVOKE EXECUTE ON FUNCTION public.talkx_benchmarks() FROM anon;

-- record_talkx_link_click() e chamada exclusivamente pela edge function
-- talkx-link via SUPABASE_SERVICE_ROLE_KEY -- nao ha caminho legitimo de
-- chamada direta via supabase.rpc() do frontend nem do POST publico
-- (que so aceita o payload por parametro, nao expoe a service key).
-- authenticated tambem nao precisa de EXECUTE direto.
REVOKE EXECUTE ON FUNCTION public.record_talkx_link_click(text, uuid, text, text) FROM anon, authenticated;

-- Mesmo sem o problema de anon, o by_segment de talkx_benchmarks() vazava
-- segment_id + metricas de segmentos de OUTROS agentes: talkx_segments tem
-- RLS por dono (created_by = caller OR admin/supervisor), mas o agregado
-- ignorava isso (SECURITY DEFINER bypassa RLS). by_template nao tem o mesmo
-- problema -- talkx_templates ja e visivel a qualquer authenticated
-- (policy "auth.uid() IS NOT NULL"), entao nao ha vazamento incremental ali.
-- Fix: by_segment so e populado quando o chamador e admin/supervisor; para
-- os demais, vem vazio (a funcao continua respondendo, so sem o
-- detalhamento por segmento que o chamador nao teria como ver via SELECT
-- direto em talkx_segments de qualquer forma).
CREATE OR REPLACE FUNCTION public.talkx_benchmarks()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff   timestamptz := now() - interval '90 days';
  v_global   jsonb;
  v_by_seg   jsonb;
  v_by_tpl   jsonb;
  v_is_admin boolean := coalesce(public.is_admin_or_supervisor(auth.uid()), false);
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

  IF v_is_admin THEN
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
  ELSE
    v_by_seg := '[]'::jsonb;
  END IF;

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
REVOKE EXECUTE ON FUNCTION public.talkx_benchmarks() FROM anon;
GRANT EXECUTE ON FUNCTION public.talkx_benchmarks() TO service_role, authenticated;
