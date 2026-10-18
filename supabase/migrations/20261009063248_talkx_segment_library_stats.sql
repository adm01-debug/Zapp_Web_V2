-- talkx_segment_library_stats
-- Rollback: drop function if exists public.talkx_segment_library_stats(text); drop function if exists public.talkx_segment_library_month(date, text); drop function if exists public.talkx_refresh_segment_library_history(integer, text); drop table if exists public.talkx_segment_library_history;
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.talkx_segment_library_stats(text);
--   drop function if exists public.talkx_segment_library_month(date, text);
--   drop function if exists public.talkx_refresh_segment_library_history(integer, text);
--   drop table if exists public.talkx_segment_library_history;
--
-- Rollback (por que ele e completo): a tabela, a policy, os GRANT/REVOKE, as tres
-- funcoes e o retrato de 8 meses (as linhas do backfill) nascem TODOS nesta
-- migration. Nao existe, antes dela, nenhum objeto, coluna, dado, policy ou ACL
-- tocado por ela — portanto o inverso e derrubar o que ela criou, na ordem
-- funcoes -> tabela (o DROP TABLE leva junto as linhas, a policy e os GRANTs).
-- Nenhuma tabela existente e alterada; nenhuma mensagem ja enviada e afetada.
--
-- X103 (Fase 9 · telas 02/03 · camada banco + testes · DDL: sim) — fatia de
-- BANCO das estatisticas da biblioteca de segmentos. A tela (KPIs/filtros) e
-- outra etapa e NAO e tocada aqui.
--
-- A biblioteca de segmentos (tela 02) precisa ler os KPIs do servidor. Hoje
-- "Ativos este mes" no navegador e `status='active'` e nao existe RPC nem
-- historico de contagem. Esta migration entrega:
--
--   (1) public.talkx_segment_library_month(p_month_start, p_timezone)
--       A medicao de UM mes, por ESCOPO do chamador (SECURITY INVOKER: quem
--       manda e a RLS de talkx_segments / talkx_campaigns /
--       talkx_campaign_segments / talkx_recipients / talkx_conversions).
--       Devolve total_segments (estoque no fim do mes), active_segments
--       (USO REAL: segmento citado por campanha que INICIOU envio no mes —
--       rascunho tem started_at nulo e nao conta), crm360_segments (estoque de
--       origin='crm360'), deliveries e conversions das campanhas com segmento
--       iniciadas no mes.
--   (2) public.talkx_segment_library_history — o retrato diario (chave
--       counted_on) que alimenta as mini-barras de 8 meses. Leitura so para
--       admin/supervisor; escrita so pela rotina (nenhum papel de aplicacao
--       ganha INSERT/UPDATE/DELETE).
--   (3) public.talkx_refresh_segment_library_history(p_months, p_timezone) —
--       rotina IDEMPOTENTE (ON CONFLICT (counted_on) DO UPDATE) que grava/
--       atualiza o retrato dos ultimos p_months meses (padrao 8). Ja e chamada
--       no fim desta migration para a serie nascer preenchida.
--   (4) public.talkx_segment_library_stats(p_timezone) -> jsonb — os KPIs:
--       total_segments; active_this_month/active_previous_month/active_delta;
--       crm360_connected/crm360_previous_month/crm360_delta; conversion
--       (value_pct, previous_pct, delta_pp, has_data, deliveries, conversions,
--       min_deliveries) SEM numero inventado quando faltam dados; e series com
--       8 pontos mensais vindos do historico.
--
-- O QUE **NAO** ENTRA AQUI (para nao invadir outras etapas/cartoes):
--   * job do pg_cron (`talkx-segment-counts-daily`): o plano V4 registra que os
--     jobs do pg_cron JA falham com "job startup timeout" e manda nao criar job
--     novo sem necessidade. A rotina fica pronta para o job, que e de outra
--     fatia (o dono do workflow/cron liga no dia certo);
--   * o que e POR SEGMENTO (last_campaign, performance/delta_pp, count_series
--     de 8 DIAS, talkx_segment_usage) e a coluna talkx_segments.estimated_at —
--     da etapa X103 completa / de outras fatias;
--   * nada de front, nada de Edge Function, nada de alteracao em tabela,
--     policy ou funcao que ja existam.
--
-- Classes de risco conferidas (efeitos colaterais): so objetos NOVOS; o unico
-- DML e o UPSERT da propria tabela nova (por chave, sem disparar gatilho de
-- auditoria/updated_at de tabela existente); a migration nao escreve em
-- talkx_segments nem em campanhas; nada de GRANT/papel fora do que esta listado.
--
-- Idempotente/replayavel: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE
-- FUNCTION, DROP POLICY IF EXISTS + CREATE POLICY, GRANT/REVOKE reaplicados.

-- ============================================================================
-- (1) o retrato diario da biblioteca
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.talkx_segment_library_history (
  counted_on       date        PRIMARY KEY,
  total_segments   integer     NOT NULL DEFAULT 0 CHECK (total_segments  >= 0),
  active_segments  integer     NOT NULL DEFAULT 0 CHECK (active_segments >= 0),
  crm360_segments  integer     NOT NULL DEFAULT 0 CHECK (crm360_segments >= 0),
  deliveries       integer     NOT NULL DEFAULT 0 CHECK (deliveries      >= 0),
  conversions      integer     NOT NULL DEFAULT 0 CHECK (conversions     >= 0),
  captured_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.talkx_segment_library_history IS
  'Talk X (X103): retrato da biblioteca de segmentos por dia (chave counted_on). No mes corrente o dia e o de hoje; nos meses fechados e o ultimo dia do mes. Grava os MESMOS numeros dos KPIs (estoque total/crm360, uso real, entregues e conversoes). Leitura para admin/supervisor; escrita so pela rotina talkx_refresh_segment_library_history.';
COMMENT ON COLUMN public.talkx_segment_library_history.active_segments IS
  'Talk X (X103): segmentos USADOS no mes — citados por campanha que INICIOU envio (started_at nao nulo). Rascunho nao conta.';

ALTER TABLE public.talkx_segment_library_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talkx_segment_library_history_select ON public.talkx_segment_library_history;
CREATE POLICY talkx_segment_library_history_select ON public.talkx_segment_library_history
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- Sem policy de INSERT/UPDATE/DELETE de proposito: a escrita e da rotina.
REVOKE ALL ON public.talkx_segment_library_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.talkx_segment_library_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.talkx_segment_library_history TO service_role;

-- ============================================================================
-- (2) a medicao de um mes, por escopo do chamador
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_segment_library_month(
  p_month_start date,
  p_timezone    text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE (
  total_segments  integer,
  active_segments integer,
  crm360_segments integer,
  deliveries      integer,
  conversions     integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tz   text        := coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'America/Sao_Paulo');
  v_from timestamptz;
  v_to   timestamptz;
BEGIN
  IF p_month_start IS NULL THEN
    RAISE EXCEPTION 'talkx_segment_library_month: p_month_start e obrigatorio' USING ERRCODE = '22004';
  END IF;

  -- Inicio e fim do mes no fuso pedido (fuso invalido estoura, nao chuta).
  v_from := (p_month_start::timestamp AT TIME ZONE v_tz);
  v_to   := ((p_month_start + interval '1 month')::timestamp AT TIME ZONE v_tz);

  RETURN QUERY
  WITH camp AS (
    -- Campanhas COM SEGMENTO que iniciaram envio na janela (rascunho fora:
    -- started_at nulo). Vale o segmento unico (segment_id) e a lista de X057.
    SELECT c.id
    FROM public.talkx_campaigns AS c
    WHERE c.started_at IS NOT NULL
      AND c.started_at >= v_from
      AND c.started_at <  v_to
      AND (
        c.segment_id IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.talkx_campaign_segments AS cs
          WHERE cs.campaign_id = c.id
        )
      )
  )
  SELECT
    -- estoque no fim do mes (no mes corrente, v_to esta no futuro = tudo o que existe)
    (SELECT count(*) FROM public.talkx_segments AS s
      WHERE s.created_at < v_to)::integer,
    -- uso real no mes
    (SELECT count(*) FROM public.talkx_segments AS s
      WHERE EXISTS (
              SELECT 1 FROM public.talkx_campaigns AS c
              WHERE c.segment_id = s.id
                AND c.started_at IS NOT NULL
                AND c.started_at >= v_from
                AND c.started_at <  v_to
            )
         OR EXISTS (
              SELECT 1 FROM public.talkx_campaign_segments AS cs
                JOIN public.talkx_campaigns AS c2 ON c2.id = cs.campaign_id
              WHERE cs.segment_id = s.id
                AND c2.started_at IS NOT NULL
                AND c2.started_at >= v_from
                AND c2.started_at <  v_to
            ))::integer,
    (SELECT count(*) FROM public.talkx_segments AS s
      WHERE s.origin = 'crm360'
        AND s.created_at < v_to)::integer,
    (SELECT count(*) FROM public.talkx_recipients AS r
       JOIN camp ON camp.id = r.campaign_id
      WHERE r.delivered_at >= v_from
        AND r.delivered_at <  v_to)::integer,
    (SELECT count(*) FROM public.talkx_conversions AS cv
       JOIN camp ON camp.id = cv.campaign_id
      WHERE coalesce(cv.occurred_at, cv.created_at) >= v_from
        AND coalesce(cv.occurred_at, cv.created_at) <  v_to)::integer;
END;
$fn$;

REVOKE ALL ON FUNCTION public.talkx_segment_library_month(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_segment_library_month(date, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_segment_library_month(date, text) IS
  'Talk X (X103): mede UM mes da biblioteca de segmentos no fuso pedido. total_segments/crm360_segments = estoque (created_at < fim do mes); active_segments = uso real (campanha com segmento que iniciou envio no mes); deliveries/conversions das campanhas com segmento. SECURITY INVOKER: o resultado segue a RLS do chamador.';

-- ============================================================================
-- (3) a rotina idempotente do retrato
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_refresh_segment_library_history(
  p_months   integer DEFAULT 8,
  p_timezone text    DEFAULT 'America/Sao_Paulo'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tz    text    := coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'America/Sao_Paulo');
  v_today date    := (now() AT TIME ZONE v_tz)::date;
  v_month date    := date_trunc('month', v_today::timestamp)::date;
  v_start date;
  v_end   date;
  v_day   date;
  v_row   record;
  v_saved integer := 0;
  i       integer;
BEGIN
  IF p_months IS NULL OR p_months < 1 OR p_months > 36 THEN
    RAISE EXCEPTION 'talkx_refresh_segment_library_history: p_months precisa estar entre 1 e 36'
      USING ERRCODE = '22023';
  END IF;

  -- Do mes mais antigo para o corrente. A chave e o dia: o mes fechado ganha o
  -- proprio ultimo dia e o mes corrente ganha hoje — rodar duas vezes no mesmo
  -- dia ATUALIZA a mesma linha (idempotente), nunca duplica.
  FOR i IN REVERSE (p_months - 1) .. 0 LOOP
    v_start := (v_month - make_interval(months => i))::date;
    v_end   := (v_start + interval '1 month')::date;
    v_day   := least(v_end - 1, v_today);

    SELECT * INTO v_row
    FROM public.talkx_segment_library_month(v_start, v_tz);

    INSERT INTO public.talkx_segment_library_history
      (counted_on, total_segments, active_segments, crm360_segments,
       deliveries, conversions, captured_at)
    VALUES
      (v_day, v_row.total_segments, v_row.active_segments, v_row.crm360_segments,
       v_row.deliveries, v_row.conversions, now())
    ON CONFLICT (counted_on) DO UPDATE
      SET total_segments  = excluded.total_segments,
          active_segments = excluded.active_segments,
          crm360_segments = excluded.crm360_segments,
          deliveries      = excluded.deliveries,
          conversions     = excluded.conversions,
          captured_at     = excluded.captured_at;

    v_saved := v_saved + 1;
  END LOOP;

  RETURN v_saved;
END;
$fn$;

-- Escrita no retrato: so a rotina, e so para o service_role (o job diario).
REVOKE ALL ON FUNCTION public.talkx_refresh_segment_library_history(integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_refresh_segment_library_history(integer, text)
  TO service_role;

COMMENT ON FUNCTION public.talkx_refresh_segment_library_history(integer, text) IS
  'Talk X (X103): grava/atualiza o retrato da biblioteca dos ultimos p_months meses (1..36, padrao 8) de forma IDEMPOTENTE por dia (ON CONFLICT (counted_on) DO UPDATE). Devolve quantos meses processou. SECURITY INVOKER e EXECUTE so para service_role: o retrato e da biblioteca inteira, nao do escopo de um usuario — quem chama e o job diario.';

-- ============================================================================
-- (4) os KPIs da biblioteca
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_segment_library_stats(
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- Base minima de entregues para a conversao media existir. Abaixo dela a
  -- resposta vem SEM numero (has_data = false e value_pct = null), nunca com
  -- um percentual inventado.
  c_min_deliveries constant integer := 100;

  v_tz          text := coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'America/Sao_Paulo');
  v_month       date;
  v_previous    date;
  v_cur         record;
  v_prev        record;
  v_has_current boolean;
  v_has_prev    boolean;
  v_value       numeric;
  v_value_prev  numeric;
  v_series      jsonb;
BEGIN
  v_month    := date_trunc('month', (now() AT TIME ZONE v_tz)::timestamp)::date;
  v_previous := (v_month - interval '1 month')::date;

  SELECT * INTO v_cur  FROM public.talkx_segment_library_month(v_month, v_tz);
  SELECT * INTO v_prev FROM public.talkx_segment_library_month(v_previous, v_tz);

  v_has_current := v_cur.deliveries >= c_min_deliveries;
  v_has_prev    := v_prev.deliveries >= c_min_deliveries;

  IF v_has_current THEN
    v_value := round(v_cur.conversions::numeric / v_cur.deliveries * 100, 1);
  END IF;
  IF v_has_prev THEN
    v_value_prev := round(v_prev.conversions::numeric / v_prev.deliveries * 100, 1);
  END IF;

  -- Serie de 8 meses (do mais antigo ao corrente). Cada ponto e o ULTIMO retrato
  -- gravado para o mes no historico; mes sem retrato vem com has_data = false e
  -- os numeros nulos ("sem dados ainda" na tela), nunca zeros disfarcados.
  WITH months AS (
    SELECT (v_month - make_interval(months => g))::date AS month_start
    FROM generate_series(7, 0, -1) AS g
  ),
  pontos AS (
    SELECT m.month_start,
           h.total_segments, h.active_segments, h.crm360_segments,
           h.deliveries, h.conversions
    FROM months AS m
    LEFT JOIN LATERAL (
      SELECT hh.total_segments, hh.active_segments, hh.crm360_segments,
             hh.deliveries, hh.conversions
      FROM public.talkx_segment_library_history AS hh
      WHERE hh.counted_on >= m.month_start
        AND hh.counted_on <  (m.month_start + interval '1 month')::date
      ORDER BY hh.counted_on DESC
      LIMIT 1
    ) AS h ON TRUE
    ORDER BY m.month_start
  )
  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'month',           p.month_start,
               'has_data',        p.total_segments IS NOT NULL,
               'total_segments',  p.total_segments,
               'active_segments', p.active_segments,
               'crm360_segments', p.crm360_segments,
               'deliveries',      p.deliveries,
               'conversions',     p.conversions,
               'conversion_pct',  CASE
                                    WHEN p.deliveries IS NOT NULL
                                     AND p.deliveries >= c_min_deliveries
                                    THEN round(p.conversions::numeric / p.deliveries * 100, 1)
                                  END
             ) ORDER BY p.month_start
           ),
           '[]'::jsonb
         )
    INTO v_series
    FROM pontos AS p;

  RETURN jsonb_build_object(
    'generated_at',          now(),
    'timezone',              v_tz,
    'month_start',           v_month,
    'total_segments',        v_cur.total_segments,
    'active_this_month',     v_cur.active_segments,
    'active_previous_month', v_prev.active_segments,
    'active_delta',          v_cur.active_segments - v_prev.active_segments,
    'crm360_connected',      v_cur.crm360_segments,
    'crm360_previous_month', v_prev.crm360_segments,
    'crm360_delta',          v_cur.crm360_segments - v_prev.crm360_segments,
    'conversion', jsonb_build_object(
      'value_pct',            v_value,
      'previous_pct',         v_value_prev,
      'delta_pp',             CASE
                                WHEN v_value IS NOT NULL AND v_value_prev IS NOT NULL
                                THEN round(v_value - v_value_prev, 1)
                              END,
      'has_data',             v_has_current,
      'deliveries',           v_cur.deliveries,
      'conversions',          v_cur.conversions,
      'previous_deliveries',  v_prev.deliveries,
      'previous_conversions', v_prev.conversions,
      'min_deliveries',       c_min_deliveries
    ),
    'series', v_series
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.talkx_segment_library_stats(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_segment_library_stats(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_segment_library_stats(text) IS
  'Talk X (X103): KPIs da biblioteca de segmentos no escopo do chamador (SECURITY INVOKER). Chaves: total_segments; active_this_month/active_previous_month/active_delta (uso real = campanha iniciada no mes); crm360_connected/crm360_previous_month/crm360_delta (origin=crm360); conversion{value_pct, previous_pct, delta_pp, has_data, deliveries, conversions, previous_deliveries, previous_conversions, min_deliveries} — abaixo de min_deliveries entregues vem value_pct null e has_data false, sem numero inventado; series[8] com {month, has_data, total_segments, active_segments, crm360_segments, deliveries, conversions, conversion_pct} vinda de talkx_segment_library_history.';

-- ============================================================================
-- (5) retrato inicial: a serie de 8 meses nasce preenchida
-- ============================================================================
-- Sem isto a serie so teria dado depois do primeiro job diario. E o mesmo
-- caminho que o job vai usar (idempotente por dia); roda como o dono da
-- migration, entao o retrato e da biblioteca inteira.
SELECT public.talkx_refresh_segment_library_history(8) AS meses_gravados;

-- ============================================================================
-- (6) Fail-closed: se algo nao colou, aborta em vez de deixar o contrato pela metade
-- ============================================================================
DO $guard$
DECLARE
  v_missing text;
  v_rls     boolean;
  v_rows    integer;
BEGIN
  SELECT string_agg(esperado.assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.talkx_segment_library_stats(text)'),
      ('public.talkx_segment_library_month(date,text)'),
      ('public.talkx_refresh_segment_library_history(integer,text)')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(esperado.assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_segment_library_stats_funcoes_ausentes: %', v_missing;
  END IF;

  IF to_regclass('public.talkx_segment_library_history') IS NULL THEN
    RAISE EXCEPTION 'talkx_segment_library_history_ausente';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class AS c
  WHERE c.oid = 'public.talkx_segment_library_history'::regclass;

  IF v_rls IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_segment_library_history_sem_rls';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'talkx_segment_library_history'
      AND policyname = 'talkx_segment_library_history_select'
  ) THEN
    RAISE EXCEPTION 'talkx_segment_library_history_sem_policy';
  END IF;

  -- anon nao le nem executa nada desta fatia
  IF has_table_privilege('anon', 'public.talkx_segment_library_history', 'SELECT')
     OR has_function_privilege('anon', 'public.talkx_segment_library_stats(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'talkx_segment_library_stats_anon_com_acesso';
  END IF;

  -- a rotina e so do service_role
  IF has_function_privilege('authenticated',
       'public.talkx_refresh_segment_library_history(integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'talkx_segment_library_refresh_aberto_para_authenticated';
  END IF;

  SELECT count(*) INTO v_rows FROM public.talkx_segment_library_history;
  IF v_rows < 8 THEN
    RAISE EXCEPTION 'talkx_segment_library_history_sem_retrato: % linhas', v_rows;
  END IF;
END;
$guard$;
