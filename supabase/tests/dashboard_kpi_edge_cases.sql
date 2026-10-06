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
-- T1 usa um admin real (buscado em user_roles; FALHA se não houver — pular em
-- silêncio é proibido) para sair do caminho fail-closed e exercitar de fato o
-- filtro p_since.
--
-- Os blocos de outlier p50/p90 e virada de dia SP NÃO ficam aqui como literais:
-- percentile_cont sobre VALUES e AT TIME ZONE sobre timestamps fixos testariam
-- o Postgres, não a dashboard_kpi. A prova real desses cenários (chamadas à
-- RPC sobre dados semeados) são D4–D7 do teste descartável acima.

DO $$
DECLARE
  v_admin uuid;
  v_kpi   jsonb;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'edge_cases T1: nenhum admin em public.user_roles — sem admin o cenario nao roda (proibido pular em silencio)';
  END IF;
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

  RAISE NOTICE 'dashboard_kpi_edge_cases: suite OK (T1; p50/p90 e virada de dia SP cobertos por D4-D7 do teste descartavel)';
END $$;
