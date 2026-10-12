-- demand_forecast
-- Rollback: remove as duas funcoes novas de leitura de demanda (heatmap semanal e previsao); o ACL cai junto com o objeto, entao DROP basta.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.dashboard_heatmap(integer);
--   drop function if exists public.demand_forecast(integer, integer);
--
-- Portal do Contato / Relatorios: previsao de demanda e heatmap de atendimento.
--
-- PROBLEMA (V2): src/components/reports/ConversationHeatmap.tsx e
-- src/components/dashboard/ConversationHeatmap.tsx trazem as linhas de
-- public.messages para o navegador (select created_at, gte created_at) e agrupam
-- NO CLIENTE com `new Date(m.created_at).getDay()/getHours()`. Duas consequencias:
--
--   1. A hora/dia da semana saem no fuso do NAVEGADOR. Uma mensagem recebida as
--      23h30 de segunda em America/Sao_Paulo e 02h30 de terca em UTC; quem abre
--      o painel em UTC (ou qualquer fuso != do negocio) le o bucket errado. A
--      leitura passa a depender de onde o operador esta, nao do dado.
--   2. O cliente ainda recebe linhas cruas: o PostgREST corta a amostra em 1000
--      linhas, entao a contagem "real" e uma amostra arbitraria (mesmo achado A6
--      que ja motivou dashboard_hourly_volume).
--
-- CORRECAO: as duas leituras passam a ser agregadas DENTRO do banco, ja no fuso
-- do negocio (America/Sao_Paulo), nao no fuso do navegador:
--
--   * public.dashboard_heatmap(dias) — contagem de mensagens RECEBIDAS por
--     (dia da semana, hora) local, para o heatmap.
--   * public.demand_forecast(dias_hist, dias_prev) — contagem real por dia e
--     previsao determinista por media do MESMO dia da semana (janela historica),
--     sem amostragem no cliente e sem aleatoriedade.
--
-- "Mensagens recebidas" = public.messages.sender = 'contact' (inbound do contato)
-- e is_deleted IS NOT TRUE (soft delete nao conta como demanda). Mesma base dos
-- demais contadores de inbound do repo (register_first_response, sla_base).
--
-- As duas funcoes sao SECURITY DEFINER (precisam do agregado completo, nao do
-- recorte de RLS de quem chama) e por isso NEGAM POR PADRAO: so respondem a
-- admin/supervisor (is_admin_or_supervisor(auth.uid())) e o mesmo erro e usado
-- para "sem sessao" e "sem papel" (sem oraculo de identidade). SET search_path
-- fixado em pg_catalog, public. ACL: REVOKE de PUBLIC/anon e GRANT so para
-- authenticated — anon morre na ACL, antes de qualquer linha ser lida.
--
-- dow segue extract(dow): 0 = domingo .. 6 = sabado (== new Date().getDay()).

CREATE OR REPLACE FUNCTION public.dashboard_heatmap(dias integer DEFAULT 28)
RETURNS TABLE (dow integer, hour integer, value bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_tz    constant text := 'America/Sao_Paulo';
  v_dias  integer := least(greatest(coalesce(dias, 28), 1), 90);
  v_desde timestamptz := (
    ((now() AT TIME ZONE v_tz)::date - (v_dias - 1))::timestamp AT TIME ZONE v_tz
  );
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'acesso restrito a admin/supervisor' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    extract(dow  FROM (m.created_at AT TIME ZONE v_tz))::integer AS dow,
    extract(hour FROM (m.created_at AT TIME ZONE v_tz))::integer AS hour,
    count(*)::bigint AS value
  FROM public.messages AS m
  WHERE m.sender = 'contact'
    AND m.is_deleted IS NOT TRUE
    AND m.created_at >= v_desde
  GROUP BY 1, 2;
END
$function$;

COMMENT ON FUNCTION public.dashboard_heatmap(integer) IS
  'Relatorios (2026-10-12): heatmap de mensagens recebidas por (dia da semana 0=domingo, hora 0-23) '
  'no fuso do negocio (America/Sao_Paulo), nao no fuso do navegador. dias default 28 (clamp 1-90). '
  'SECURITY DEFINER com gate is_admin_or_supervisor(auth.uid()) — so admin/supervisor. '
  'Substitui o agrupamento no cliente de ConversationHeatmap.tsx (new Date().getDay()/getHours() '
  'lia a hora do navegador) e o fetch cru de linhas (corte de 1000 linhas do PostgREST).';

CREATE OR REPLACE FUNCTION public.demand_forecast(
  dias_hist integer DEFAULT 28,
  dias_prev integer DEFAULT 7
)
RETURNS TABLE (d date, kind text, dow integer, value numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_tz    constant text := 'America/Sao_Paulo';
  v_hist  integer := least(greatest(coalesce(dias_hist, 28), 7), 90);
  v_prev  integer := least(greatest(coalesce(dias_prev, 7), 1), 30);
  v_hoje  date := (now() AT TIME ZONE v_tz)::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'acesso restrito a admin/supervisor' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH diario AS (
    SELECT (m.created_at AT TIME ZONE v_tz)::date AS d,
           count(*)::numeric AS n
    FROM public.messages AS m
    WHERE m.sender = 'contact'
      AND m.is_deleted IS NOT TRUE
      AND (m.created_at AT TIME ZONE v_tz)::date
          BETWEEN v_hoje - (v_hist - 1) AND v_hoje
    GROUP BY 1
  ),
  por_dow AS (
    SELECT extract(dow FROM base.d)::integer AS dow,
           avg(base.n) AS media
    FROM diario AS base
    GROUP BY 1
  ),
  reais AS (
    SELECT dg.d,
           'actual'::text AS kind,
           extract(dow FROM dg.d)::integer AS dow,
           coalesce(base.n, 0)::numeric AS value
    FROM (SELECT v_hoje - 6 + i AS d FROM generate_series(0, 6) AS i) AS dg
    LEFT JOIN diario AS base ON base.d = dg.d
  ),
  previstos AS (
    SELECT dg.d,
           'forecast'::text AS kind,
           extract(dow FROM dg.d)::integer AS dow,
           round(md.media, 0)::numeric AS value
    FROM (SELECT v_hoje + i AS d FROM generate_series(1, v_prev) AS i) AS dg
    LEFT JOIN por_dow AS md ON md.dow = extract(dow FROM dg.d)::integer
  )
  SELECT u.d, u.kind, u.dow, u.value
  FROM (
    SELECT * FROM reais
    UNION ALL
    SELECT * FROM previstos
  ) AS u
  ORDER BY u.d, u.kind;
END
$function$;

COMMENT ON FUNCTION public.demand_forecast(integer, integer) IS
  'Relatorios (2026-10-12): serie de demanda de mensagens recebidas (sender=contact) por dia no fuso '
  'do negocio. kind=''actual'' = ultimos 7 dias (0 real se nao houve inbound); kind=''forecast'' = '
  'proximos dias_prev dias, previstos pela media do MESMO dia da semana na janela dias_hist '
  '(determinista, sem aleatoriedade; NULL quando nao ha historico daquele dia da semana — 0 nunca e '
  'inventado). dow 0=domingo..6=sabado. dias_hist default 28 (clamp 7-90), dias_prev default 7 '
  '(clamp 1-30). SECURITY DEFINER com gate is_admin_or_supervisor(auth.uid()).';

REVOKE ALL ON FUNCTION public.dashboard_heatmap(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_heatmap(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.demand_forecast(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demand_forecast(integer, integer) TO authenticated;
