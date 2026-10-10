-- Auditoria multi-agente 2026-09-16 (5 agentes especializados) sobre as
-- correcoes da sessao anterior. 3 achados confirmados, todos tecnicos
-- (nao decisoes de produto):

-- 1. talkx_benchmarks() (migration 20260916150000) depende de
--    talkx_campaign_metrics, que ganhou security_invoker=true na migration
--    20260916170000 (fix correto de RLS bypass). Efeito colateral nao
--    percebido: talkx_benchmarks() e SECURITY INVOKER, entao passou a
--    herdar a policy "Users can view own campaigns" de talkx_campaigns --
--    para qualquer agente nao-admin, o que deveria ser medias GLOBAIS da
--    organizacao (docs/talkx/PLANO_IMPLEMENTACAO_TALKX_100.md linhas
--    1771-1781: "RPC talkx_benchmarks() -> medias globais") vira,
--    silenciosamente, medias das PROPRIAS campanhas do chamador.
--    Seguro tornar SECURITY DEFINER: a funcao so retorna agregados
--    (COUNT/AVG/PERCENTILE_CONT), nunca campaign_id nem coluna
--    identificavel de outro agente -- nao reabre o vazamento que
--    170000 fechou (esse era um problema de SELECT direto na view, nao
--    de uma funcao que so devolve numeros agregados).
ALTER FUNCTION public.talkx_benchmarks() SECURITY DEFINER;

-- 2. talkx_campaign_report (migration 20260916180000) tinha o guard
--    "IF NOT EXISTS (...) RAISE EXCEPTION" como statement SEPARADO da CTE
--    principal. Sob READ COMMITTED, cada statement top-level dentro de
--    uma funcao plpgsql tira seu proprio snapshot MVCC -- se a campanha
--    for deletada entre os dois statements (fluxo real existe em
--    src/hooks/integrations/useTalkX.ts), o guard passa mas a CTE fica
--    vazia e a funcao volta a devolver NULL em silencio, exatamente o bug
--    que a migration foi escrita pra eliminar. Fix: um UNICO statement
--    (a propria CTE) computa o resultado; o RAISE acontece so DEPOIS,
--    lendo a variavel ja populada -- sem segundo acesso a tabela, sem
--    janela de corrida.
--
-- 3. O CTE by_variant fazia LEFT JOIN contra public.campaign_ab_variants,
--    tabela errada (referencia public.campaigns, nao tem relacao com
--    talkx_recipients.variant_id). A coluna correta e
--    public.talkx_template_variants (chave real do FK, coluna de rotulo
--    chama-se "label", nao "variant_name", e nao e escopada por
--    campaign_id -- variant_id ja identifica a variante unicamente).
--    Bug pre-existente desde 20260916130000, reembarcado sem correcao no
--    CREATE OR REPLACE de 180000.
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
