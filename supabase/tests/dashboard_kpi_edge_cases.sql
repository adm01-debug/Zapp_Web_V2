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
-- com dados controlados — incluindo p50/p90, virada de dia SP e período
-- escolhido + período anterior de mesmo tamanho (blocos D e E de lá).
--
-- T1 usa um admin real (buscado em user_roles; FALHA se não houver — pular em
-- silêncio é proibido) para sair do caminho fail-closed e exercitar de fato a
-- janela da RPC.
--
-- Os blocos de outlier p50/p90 e virada de dia SP NÃO ficam aqui como literais:
-- percentile_cont sobre VALUES e AT TIME ZONE sobre timestamps fixos testariam
-- o Postgres, não a dashboard_kpi. A prova real desses cenários (chamadas à
-- RPC sobre dados semeados) são D4–D7 e E1–E5 do teste descartável acima.
--
-- 13/10/2026 (cartão t_969a17db, E31/E34/IA-056): a assinatura deixou de ser
-- dashboard_kpi(p_since, p_queue, p_agent) e passou a dashboard_kpi(p_from,
-- p_until, p_queue, p_agent), com janelas de fim EXCLUSIVO e período anterior
-- de mesmo tamanho. As asserções abaixo cobram esse contrato sem depender de
-- dados semeados: chaves de saída preservadas, overload antigo ausente, janela
-- aberta (p_until NULL), janela de tamanho zero e a igualdade do default com a
-- janela explícita do dia civil de America/Sao_Paulo.

DO $$
DECLARE
  v_admin      uuid;
  v_kpi        jsonb;
  v_day_start  timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_day_end    timestamptz := v_day_start + interval '1 day';
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'edge_cases T1: nenhum admin em public.user_roles — sem admin o cenario nao roda (proibido pular em silencio)';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- T1: 0 linhas — RPC real com janela 10 anos no futuro: contagens 0,
  -- médias/percentis NULL (sem divisão por zero), arrays zerados.
  v_kpi := public.dashboard_kpi(now() + interval '10 years', now() + interval '10 years' + interval '1 day');
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

  -- T2: contrato de saída preservado (mesmas 10 chaves do hook useDashboardKpi)
  -- após a troca de assinatura.
  IF NOT (v_kpi ?& array[
       'resolvedToday', 'resolvedYesterday', 'resolvedHourly8',
       'avgResponseToday', 'avgResponseYesterday', 'p90ResponseToday',
       'responseHourly8', 'slaBreachedToday',
       'answeredTodayCount', 'answeredYesterdayCount']) THEN
    RAISE EXCEPTION 'edge_cases T2 FALHOU: a RPC perdeu chaves do contrato de saída, veio %', v_kpi;
  END IF;

  -- T3: a assinatura antiga (p_since, p_queue, p_agent) NÃO pode mais existir —
  -- senão o PostgREST vê overload ambíguo e a chamada quebra.
  IF to_regprocedure('public.dashboard_kpi(timestamp with time zone,uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'edge_cases T3 FALHOU: a assinatura antiga dashboard_kpi(timestamptz,uuid,uuid) ainda existe (overload ambíguo no PostgREST)';
  END IF;
  IF to_regprocedure('public.dashboard_kpi(timestamp with time zone,timestamp with time zone,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'edge_cases T3 FALHOU: a assinatura nova dashboard_kpi(timestamptz,timestamptz,uuid,uuid) não existe';
  END IF;

  -- T4a: p_until NULL = janela ABERTA — devolve as métricas sem estourar
  -- (o teto aberto não pode virar created_at < NULL, senão tudo zera).
  v_kpi := public.dashboard_kpi(now() - interval '1 day', NULL);
  IF (v_kpi ->> 'resolvedToday') IS NULL OR (v_kpi ->> 'answeredTodayCount') IS NULL THEN
    RAISE EXCEPTION 'edge_cases T4a FALHOU: p_until NULL (janela aberta) não devolveu contagens, veio %', v_kpi;
  END IF;

  -- T4b: fim exclusivo — janela de tamanho zero (p_until = p_from) zera tudo,
  -- sem erro de intervalo negativo.
  v_kpi := public.dashboard_kpi(v_day_start, v_day_start);
  IF (v_kpi ->> 'resolvedToday') IS DISTINCT FROM '0'
     OR (v_kpi ->> 'resolvedYesterday') IS DISTINCT FROM '0'
     OR (v_kpi -> 'resolvedHourly8')::text <> '[0, 0, 0, 0, 0, 0, 0, 0]' THEN
    RAISE EXCEPTION 'edge_cases T4b FALHOU: janela de tamanho zero deveria zerar, veio %', v_kpi;
  END IF;

  -- T5: default (sem argumentos) = dia atual em America/Sao_Paulo — precisa bater
  -- com a janela explícita [início de hoje, início de amanhã).
  IF public.dashboard_kpi() IS DISTINCT FROM public.dashboard_kpi(v_day_start, v_day_end) THEN
    RAISE EXCEPTION 'edge_cases T5 FALHOU: o default da RPC difere da janela explícita do dia civil SP';
  END IF;

  RAISE NOTICE 'dashboard_kpi_edge_cases: suite OK (T1 vazio, T2 contrato, T3 sem overload antigo, T4 janela aberta/tamanho zero, T5 default = dia SP; p50/p90 e virada de dia SP cobertos por D4-D7/E1-E5 do teste descartavel)';
END $$;
