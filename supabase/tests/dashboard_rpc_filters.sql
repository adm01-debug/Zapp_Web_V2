-- Teste de regressão dos filtros de RPC do Dashboard (E36, plano de 50 etapas — Fase 4)
-- Ref: claude/PLANO_DASHBOARD_50_ETAPAS.md, Fase 4 (E31-E36)
--
-- ESCOPO E LIMITAÇÃO (mesma nota do rls_dashboard.sql — ler antes de confiar no resultado):
-- Roda como service_role (BYPASSRLS). dashboard_kpi/dashboard_contact_counts/
-- dashboard_hourly_volume não dependem de RLS para a trava de p_agent — a trava é
-- feita EXPLICITAMENTE dentro de cada função (`IF NOT is_admin_or_supervisor(auth.uid())
-- THEN p_agent := auth.uid()`, ou o equivalente via CTE `effective`), então este teste
-- valida a MESMA lógica que roda em produção via PostgREST, independente de BYPASSRLS.
-- Usa dados REAIS de produção via set_config('request.jwt.claims', ...) para simular
-- auth.uid() de admin/agente real (pula sozinho se os papéis não existirem).
-- Sem EXCEPTION = suite verde. Read-only, sem side effects.

DO $$
DECLARE
  v_admin_user       uuid;
  v_agent_user       uuid;
  v_agent_profile    uuid;
  v_other_agent_user uuid;
  v_queue            uuid;
  v_kpi_unfiltered   jsonb;
  v_kpi_by_queue     jsonb;
  v_kpi_fake_queue   jsonb;
  v_kpi_agent_a      jsonb;
  v_kpi_agent_spoof  jsonb;
  v_contacts_a       jsonb;
  v_contacts_spoof   jsonb;
  v_hourly_count_a   int;
  v_hourly_count_sp  int;
  v_fake_queue       uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  SELECT user_id INTO v_admin_user FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  SELECT ur.user_id, p.id INTO v_agent_user, v_agent_profile
    FROM public.user_roles ur JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'agent' LIMIT 1;
  SELECT ur.user_id INTO v_other_agent_user
    FROM public.user_roles ur JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'agent' AND p.id <> v_agent_profile LIMIT 1;
  SELECT id INTO v_queue FROM public.queues LIMIT 1;

  IF v_admin_user IS NULL OR v_agent_user IS NULL THEN
    RAISE NOTICE 'dashboard_rpc_filters: sem admin ou agent em produção, suite inteira pulada (nada para comparar)';
    RETURN;
  END IF;

  -- T1: dashboard_kpi — p_queue filtra de fato (staff, sem p_agent) e fila
  -- inexistente não quebra a RPC (retorna 0, não NULL/erro — cobre parte do E44).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_user)::text, true);
  v_kpi_unfiltered := public.dashboard_kpi(now() - interval '30 days', NULL, NULL);
  IF v_queue IS NOT NULL THEN
    v_kpi_by_queue := public.dashboard_kpi(now() - interval '30 days', v_queue, NULL);
    IF (v_kpi_by_queue->>'resolvedToday')::int > (v_kpi_unfiltered->>'resolvedToday')::int THEN
      RAISE EXCEPTION 'dashboard_rpc_filters T1 FALHOU: dashboard_kpi com p_queue retornou resolvedToday maior que sem filtro (% > %)',
        v_kpi_by_queue->>'resolvedToday', v_kpi_unfiltered->>'resolvedToday';
    END IF;
  END IF;
  v_kpi_fake_queue := public.dashboard_kpi(now() - interval '1 day', v_fake_queue, NULL);
  IF v_kpi_fake_queue IS NULL OR (v_kpi_fake_queue->>'resolvedToday') IS NULL THEN
    RAISE EXCEPTION 'dashboard_rpc_filters T1b FALHOU: dashboard_kpi com fila inexistente deveria retornar 0, veio NULL/ausente';
  ELSIF (v_kpi_fake_queue->>'resolvedToday')::int <> 0 THEN
    RAISE EXCEPTION 'dashboard_rpc_filters T1b FALHOU: dashboard_kpi com fila inexistente deveria ter resolvedToday=0, veio %', v_kpi_fake_queue->>'resolvedToday';
  END IF;

  -- T2: dashboard_kpi — trava de p_agent para não-staff (E33 automatizado).
  -- Agente comum chamando com p_agent = OUTRO agente deve dar o MESMO resultado
  -- que chamar com p_agent = si mesmo — a função ignora o p_agent recebido e
  -- força auth.uid() quando NOT is_admin_or_supervisor(auth.uid()).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_agent_user)::text, true);
  v_kpi_agent_a := public.dashboard_kpi(now() - interval '30 days', NULL, v_agent_user);
  IF v_other_agent_user IS NOT NULL THEN
    v_kpi_agent_spoof := public.dashboard_kpi(now() - interval '30 days', NULL, v_other_agent_user);
    IF v_kpi_agent_spoof IS DISTINCT FROM v_kpi_agent_a THEN
      RAISE EXCEPTION 'dashboard_rpc_filters T2 FALHOU: dashboard_kpi deixou agente comum ler KPI de outro agente via p_agent (trava E33 quebrada)';
    END IF;

    -- T3: mesma trava em dashboard_contact_counts
    v_contacts_a := public.dashboard_contact_counts(now() - interval '30 days', now(), NULL, v_agent_user);
    v_contacts_spoof := public.dashboard_contact_counts(now() - interval '30 days', now(), NULL, v_other_agent_user);
    IF v_contacts_spoof IS DISTINCT FROM v_contacts_a THEN
      RAISE EXCEPTION 'dashboard_rpc_filters T3 FALHOU: dashboard_contact_counts deixou agente comum ler contagem de outro agente via p_agent';
    END IF;

    -- T4: mesma trava em dashboard_hourly_volume
    SELECT count(*) INTO v_hourly_count_a FROM public.dashboard_hourly_volume(8, NULL, v_agent_user);
    SELECT count(*) INTO v_hourly_count_sp FROM public.dashboard_hourly_volume(8, NULL, v_other_agent_user);
    IF v_hourly_count_sp <> v_hourly_count_a THEN
      RAISE EXCEPTION 'dashboard_rpc_filters T4 FALHOU: dashboard_hourly_volume deixou agente comum ler volume de outro agente via p_agent (% linhas vs % esperado)',
        v_hourly_count_sp, v_hourly_count_a;
    END IF;
  ELSE
    RAISE NOTICE 'dashboard_rpc_filters: só 1 agent em produção, T2-T4 (spoof entre agentes) pulados';
  END IF;

  RAISE NOTICE 'dashboard_rpc_filters: suite completa OK (T1, T1b, T2-T4) — admin=%, agent=%, other_agent=%',
    v_admin_user, v_agent_user, v_other_agent_user;
END $$;
