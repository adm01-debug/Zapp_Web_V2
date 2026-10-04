-- E44 (plano de 50 etapas, Fase 6): casos de borda de dashboard_kpi (RPC, E23).
--
-- Reescrito em 04/10/2026 (cartão t_78d03f99, achado DASH-ACCEPTANCE-001 /
-- DASH-091): a versão anterior era uma série de SELECTs cujos resultados
-- esperados viviam em COMENTÁRIOS ("Resultado observado 25/09/2026... OK") —
-- nada falhava automaticamente. Agora cada caso é uma asserção com
-- RAISE EXCEPTION: sem EXCEPTION = suite verde.
--
-- LIMITAÇÃO: roda como service_role (BYPASSRLS) — prova a lógica da RPC, não o
-- enforcement. A prova de fronteira com roles não privilegiadas (anon/
-- authenticated de verdade) e fixtures determinísticas acima do cap vive em
-- scripts/db-audit/dashboard-rls-authorization.test.sh (Postgres 17 descartável,
-- job "Contrato DB offline"), que cobre estes mesmos edge cases contra a RPC
-- com dados controlados — incluindo p50/p90 e virada de dia SP.
--
-- T1 usa um admin real (buscado em user_roles; pula sozinho se não houver) para
-- sair do caminho fail-closed e exercitar de fato o filtro p_since.

DO $$
DECLARE
  v_admin uuid;
  v_kpi   jsonb;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE NOTICE 'dashboard_kpi_edge_cases T1: sem admin em produção, pulado';
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

    -- T1: 0 linhas — RPC real com p_since 10 anos no futuro: contagens 0,
    -- médias/percentis NULL (sem divisão por zero), arrays zerados.
    v_kpi := public.dashboard_kpi(now() + interval '10 years');
    IF (v_kpi ->> 'resolvedToday') IS DISTINCT FROM '0'
       OR (v_kpi ->> 'resolvedYesterday') IS DISTINCT FROM '0'
       OR (v_kpi ->> 'answeredTodayCount') IS DISTINCT FROM '0'
       OR (v_kpi ->> 'answeredYesterdayCount') IS DISTINCT FROM '0'
       OR (v_kpi ->> 'slaBreachedToday') IS DISTINCT FROM '0' THEN
      RAISE EXCEPTION 'edge_cases T1 FALHOU: janela futura deveria zerar contagens, veio %', v_kpi;
    END IF;
    IF (v_kpi ->> 'avgResponseToday') IS NOT NULL
       OR (v_kpi ->> 'avgResponseYesterday') IS NOT NULL
       OR (v_kpi ->> 'p90ResponseToday') IS NOT NULL THEN
      RAISE EXCEPTION 'edge_cases T1b FALHOU: janela vazia deveria ter médias/percentis NULL, veio %', v_kpi;
    END IF;
    IF (v_kpi -> 'resolvedHourly8')::text <> '[0, 0, 0, 0, 0, 0, 0, 0]'
       OR (v_kpi -> 'responseHourly8')::text <> '[0, 0, 0, 0, 0, 0, 0, 0]' THEN
      RAISE EXCEPTION 'edge_cases T1c FALHOU: janela vazia deveria ter hourly8 zerado, veio %', v_kpi;
    END IF;
  END IF;

  -- T2: 1 outlier de 10h (36000s) entre 5 respostas normais (60-150s). A RPC
  -- usa percentile_cont(0.5) pro card e percentile_cont(0.9) só no tooltip —
  -- o p50 não pode ser puxado pelo outlier, o p90 deve refleti-lo. Assinatura
  -- exata das expressões usadas pela RPC; a prova acoplada à função real está
  -- no teste descartável (D4/D5, mesmos valores esperados com dados seedados).
  IF (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int
      FROM (VALUES (60::numeric), (120), (90), (150), (110), (36000)) t(response_seconds)) <> 115 THEN
    RAISE EXCEPTION 'edge_cases T2 FALHOU: p50 deveria ser 115 (mediana robusta ao outlier)';
  END IF;
  IF (SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY response_seconds))::int
      FROM (VALUES (60::numeric), (120), (90), (150), (110), (36000)) t(response_seconds)) <> 18075 THEN
    RAISE EXCEPTION 'edge_cases T2b FALHOU: p90 deveria ser 18075 (reflete o outlier)';
  END IF;

  -- T3/T4: virada de dia + timezone SP. A RPC bucketa por
  -- (created_at AT TIME ZONE 'America/Sao_Paulo')::date — evento 23:30 em SP
  -- (02:30 UTC do dia seguinte) cai no dia SP; a prova acoplada à RPC está no
  -- teste descartável (D6/D7, closure seedada às 23h30 de ontem-SP).
  IF ('2026-09-25 23:30:00-03'::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date <> '2026-09-25'::date
     OR ('2026-09-25 23:30:00-03'::timestamptz AT TIME ZONE 'UTC')::date = '2026-09-25'::date THEN
    RAISE EXCEPTION 'edge_cases T3 FALHOU: bucket deveria ser o dia civil SP (25), não UTC (26)';
  END IF;
  IF extract(hour FROM '2026-09-25 23:30:00-03'::timestamptz AT TIME ZONE 'America/Sao_Paulo')::int <> 23 THEN
    RAISE EXCEPTION 'edge_cases T4 FALHOU: hora do bucket deveria ser 23 (SP), não 2 (UTC)';
  END IF;

  RAISE NOTICE 'dashboard_kpi_edge_cases: suite completa OK (T1-T4)';
END $$;
