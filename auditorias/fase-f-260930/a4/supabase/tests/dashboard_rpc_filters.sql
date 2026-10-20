-- Teste de regressão dos filtros de RPC do Dashboard (E36, plano de 50 etapas — Fase 4)
-- Ref: claude/PLANO_DASHBOARD_50_ETAPAS.md, Fase 4 (E31-E36)
--
-- ESCOPO E LIMITAÇÃO (mesma nota do rls_dashboard.sql — ler antes de confiar no resultado):
-- Roda como service_role (BYPASSRLS). dashboard_kpi/dashboard_contact_counts/
-- dashboard_hourly_volume não dependem de RLS para a trava de p_agent — a trava é
-- feita EXPLICITAMENTE dentro de cada função (via `public.get_profile_id_for_user(auth.uid())`
-- + CTE `effective`, ou o equivalente em plpgsql), então este teste valida a MESMA lógica
-- que roda em produção via PostgREST, independente de BYPASSRLS.
-- Usa dados REAIS de produção via set_config('request.jwt.claims', ...) para simular
-- auth.uid() de admin/agente real (pula sozinho se os papéis não existirem).
-- Sem EXCEPTION = suite verde. Read-only, sem side effects.
--
-- CORREÇÃO DE 26/09/2026 (auditoria de 5 agentes, achado do Agente 2): T2-T4 originais
-- só comparavam o resultado de p_agent=self contra p_agent=outro-agente (spoof) — ambas
-- as chamadas usam o MESMO auth.uid() da sessão simulada, então um bug que troca o espaço
-- de UUID (auth.uid()=profiles.user_id vs contacts.assigned_to=profiles.id, o P0 real que
-- zerou o dashboard de todo agente entre 25/09 19:11 UTC e 25/09 22:14 UTC) faz as duas
-- chamadas retornarem o MESMO resultado errado (ambas vazias) — suite ficava 100% verde
-- com o bug crítico ativo. T3b/T4b abaixo são canários novos: comparam contra uma
-- contagem feita DIRETO nas tabelas (bypassando a RPC por completo), then assert
-- que "agente tem dado real" implica "RPC não retorna vazio" — isso teria pego o P0.

DO $$
DECLARE
  v_admin_user         uuid;
  v_agent_user          uuid;
  v_agent_profile       uuid;
  v_other_agent_user    uuid;
  v_queue               uuid;
  v_kpi_unfiltered      jsonb;
  v_kpi_by_queue        jsonb;
  v_kpi_fake_queue      jsonb;
  v_kpi_agent_a         jsonb;
  v_kpi_agent_spoof     jsonb;
  v_contacts_a          jsonb;
  v_contacts_spoof      jsonb;
  v_hourly_count_a      int;
  v_hourly_count_sp     int;
  v_hourly_sum_a        bigint;
  v_ground_truth_total  int;
  v_ground_truth_msgs   int;
  v_fake_queue          uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  SELECT user_id INTO v_admin_user FROM public.user_roles WHERE role = 'admin' LIMIT 1;

  -- Escolhe, entre os agentes, o que tem MAIS contatos atribuídos e atualizados na
  -- mesma janela que a RPC vai usar (30 dias) — garante um canário com dado real
  -- não-zero sempre que existir QUALQUER agente com carteira ativa, em vez de cair
  -- de forma arbitrária num agente que porventura esteja com a carteira vazia hoje.
  SELECT ur.user_id, p.id
    INTO v_agent_user, v_agent_profile
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    LEFT JOIN public.contacts c ON c.assigned_to = p.id
      AND c.updated_at >= now() - interval '30 days' AND c.updated_at <= now()
    WHERE ur.role = 'agent'
    GROUP BY ur.user_id, p.id
    ORDER BY count(c.id) DESC
    LIMIT 1;

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
  -- resolve o próprio perfil quando NOT is_admin_or_supervisor(auth.uid()).
  -- (Nota: por si só este teste NÃO detecta o P0 de UUID — ver T3b/T4b abaixo.)
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

    -- T3b (NOVO, canário do P0 de 25/09/2026): compara contra contagem direta na
    -- tabela `contacts`, bypassando a RPC — se o agente tem carteira real nesta
    -- janela mas a RPC devolve 'total'=0, é o sintoma exato do bug de espaço de
    -- UUID (a função comparava contacts.assigned_to contra profiles.user_id em vez
    -- de profiles.id, então NENHUMA linha batia e tudo virava zero silenciosamente).
    SELECT count(*) INTO v_ground_truth_total
      FROM public.contacts
      WHERE assigned_to = v_agent_profile
        AND updated_at >= now() - interval '30 days' AND updated_at <= now();
    IF v_ground_truth_total > 0 AND (v_contacts_a->>'total')::int = 0 THEN
      RAISE EXCEPTION 'dashboard_rpc_filters T3b FALHOU (canário do P0 de UUID/25-09-2026): agente tem % contato(s) reais atribuídos (contacts.assigned_to = profiles.id) nesta janela, mas dashboard_contact_counts retornou total=0 — provável regressão do bug de espaço de UUID (auth.uid()=profiles.user_id vs profiles.id)',
        v_ground_truth_total;
    END IF;

    -- T4: mesma trava em dashboard_hourly_volume
    SELECT count(*) INTO v_hourly_count_a FROM public.dashboard_hourly_volume(8, NULL, v_agent_user);
    SELECT count(*) INTO v_hourly_count_sp FROM public.dashboard_hourly_volume(8, NULL, v_other_agent_user);
    IF v_hourly_count_sp <> v_hourly_count_a THEN
      RAISE EXCEPTION 'dashboard_rpc_filters T4 FALHOU: dashboard_hourly_volume deixou agente comum ler volume de outro agente via p_agent (% linhas vs % esperado)',
        v_hourly_count_sp, v_hourly_count_a;
    END IF;

    -- T4b (NOVO, mesmo canário do T3b, aplicado a dashboard_hourly_volume): mensagens
    -- reais de contatos do agente nos últimos 8 dias, contadas direto em `messages`
    -- JOIN `contacts`, bypassando a RPC por completo.
    SELECT coalesce(sum(message_count), 0) INTO v_hourly_sum_a
      FROM public.dashboard_hourly_volume(8, NULL, v_agent_user);
    SELECT count(*) INTO v_ground_truth_msgs
      FROM public.messages m
      JOIN public.contacts ct ON ct.id = m.contact_id
      WHERE ct.assigned_to = v_agent_profile
        AND m.created_at >= now() - interval '8 days';
    IF v_ground_truth_msgs > 0 AND v_hourly_sum_a = 0 THEN
      RAISE EXCEPTION 'dashboard_rpc_filters T4b FALHOU (canário do P0 de UUID/25-09-2026): agente tem % mensagem(ns) real(is) nos últimos 8 dias em contatos próprios, mas dashboard_hourly_volume retornou soma=0 — provável regressão do bug de espaço de UUID',
        v_ground_truth_msgs;
    END IF;
  ELSE
    RAISE NOTICE 'dashboard_rpc_filters: só 1 agent em produção, T2-T4/T3b/T4b (spoof e canário de UUID) pulados';
  END IF;

  RAISE NOTICE 'dashboard_rpc_filters: suite completa OK (T1, T1b, T2-T4, T3b, T4b) — admin=%, agent=% (perfil %, contatos reais na janela=%), other_agent=%',
    v_admin_user, v_agent_user, v_agent_profile, v_ground_truth_total, v_other_agent_user;
END $$;
