-- Teste de regressão das policies RLS do módulo Dashboard (E13, plano de 50 etapas)
-- Ref: claude/PLANO_DASHBOARD_50_ETAPAS.md, Fase 1
--
-- ESCOPO E LIMITAÇÃO (importante, ler antes de confiar no resultado):
-- Roda como service_role (a wrapper `db_query`/`mcp_exec` do MCP não permite `SET ROLE
-- authenticated` dentro de função security-definer — testado em 25/09/2026, erro 42501). service_role
-- tem BYPASSRLS, então SELECTs aqui NÃO passam pelo enforcement real das policies.
-- O que este script valida de fato: com `set_config('request.jwt.claims', ..., true)` é possível
-- fazer `auth.uid()` responder como um usuário real dentro da mesma transação (sem trocar role) —
-- e as funções SECURITY DEFINER das policies (is_admin_or_supervisor, is_contact_visible_to_user)
-- checam `_user_id = auth.uid()` internamente, então isso valida a LÓGICA de autorização com o
-- mesmo caminho que a policy usa em produção. Não é teste de enforcement via PostgREST/JWT real
-- (candidato a Próximos passos separado, fora do escopo desta etapa).
--
-- T1-T4 usam usuários e contatos REAIS de produção (pulam sozinhos se o papel não existir).
-- T5-T7 são regressão estrutural pós-migration (E07/E08/E09-E11) — falham propositalmente até a
-- migration 20260925150000_dashboard_fase1_rls_indices.sql ser aplicada.
-- Sem EXCEPTION = suite verde. Read-only, sem side effects (transação implícita do db_query).

DO $$
DECLARE
  v_admin_user    uuid;
  v_agent_user    uuid;
  v_agent_profile uuid;
  v_own_contact   uuid;
  v_other_contact uuid;
BEGIN
  SELECT user_id INTO v_admin_user FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  SELECT ur.user_id, p.id INTO v_agent_user, v_agent_profile
    FROM public.user_roles ur JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'agent' LIMIT 1;

  IF v_admin_user IS NULL OR v_agent_user IS NULL THEN
    RAISE NOTICE 'rls_dashboard: sem admin ou agent em produção, T1-T4 pulados (nada para comparar)';
  ELSE
    SELECT id INTO v_own_contact FROM public.contacts WHERE assigned_to = v_agent_profile LIMIT 1;
    SELECT id INTO v_other_contact FROM public.contacts
      WHERE assigned_to IS DISTINCT FROM v_agent_profile AND assigned_to IS NOT NULL LIMIT 1;

    -- T1: is_admin_or_supervisor(admin real) = true, com auth.uid() = admin
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_user)::text, true);
    IF NOT public.is_admin_or_supervisor(v_admin_user) THEN
      RAISE EXCEPTION 'rls_dashboard T1 FALHOU: is_admin_or_supervisor(admin) deveria ser true';
    END IF;

    -- T2-T4: com auth.uid() = agent comum
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_agent_user)::text, true);

    IF public.is_admin_or_supervisor(v_agent_user) THEN
      RAISE EXCEPTION 'rls_dashboard T2 FALHOU: is_admin_or_supervisor(agent comum) deveria ser false';
    END IF;

    IF v_own_contact IS NOT NULL AND NOT public.is_contact_visible_to_user(v_own_contact, v_agent_user) THEN
      RAISE EXCEPTION 'rls_dashboard T3 FALHOU: agent deveria ver contato próprio %', v_own_contact;
    END IF;

    IF v_other_contact IS NOT NULL THEN
      DECLARE
        v_visible    boolean;
        v_same_queue boolean;
      BEGIN
        v_visible := public.is_contact_visible_to_user(v_other_contact, v_agent_user);
        SELECT EXISTS (
          SELECT 1 FROM public.contacts c
          JOIN public.queue_members qm ON qm.queue_id = c.queue_id
          WHERE c.id = v_other_contact AND qm.profile_id = v_agent_profile AND qm.is_active = true
        ) INTO v_same_queue;
        IF v_visible AND NOT v_same_queue THEN
          RAISE EXCEPTION 'rls_dashboard T4 FALHOU: agent viu contato % de outro agente sem ser membro da fila', v_other_contact;
        END IF;
      END;
    END IF;

    RAISE NOTICE 'rls_dashboard: T1-T4 OK (admin=%, agent=%)', v_admin_user, v_agent_user;
  END IF;

  -- T5 (E08 regressão): conversation_events com exatamente 1 policy SELECT, preservando o caminho de fila
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='conversation_events' AND cmd='SELECT') <> 1 THEN
    RAISE EXCEPTION 'rls_dashboard T5 FALHOU: conversation_events deveria ter exatamente 1 policy SELECT após E08';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='conversation_events' AND cmd='SELECT'
      AND qual ILIKE '%is_contact_visible_to_user%'
  ) THEN
    RAISE EXCEPTION 'rls_dashboard T5b FALHOU: policy SELECT de conversation_events perdeu o caminho de fila';
  END IF;

  -- T6 (E07 regressão): conversation_sla com exatamente 1 policy SELECT
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='conversation_sla' AND cmd='SELECT') <> 1 THEN
    RAISE EXCEPTION 'rls_dashboard T6 FALHOU: conversation_sla deveria ter exatamente 1 policy SELECT após E07';
  END IF;

  -- T7 (E09-E11 regressão): índices novos existem
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='conversation_closures' AND indexname='idx_closures_created_at') THEN
    RAISE EXCEPTION 'rls_dashboard T7a FALHOU: idx_closures_created_at ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='conversation_sla' AND indexname='idx_sla_first_message_at') THEN
    RAISE EXCEPTION 'rls_dashboard T7b FALHOU: idx_sla_first_message_at ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='conversation_events' AND indexname='idx_events_created_at') THEN
    RAISE EXCEPTION 'rls_dashboard T7c FALHOU: idx_events_created_at ausente';
  END IF;

  RAISE NOTICE 'rls_dashboard: suite completa OK (T1-T7)';
END $$;
