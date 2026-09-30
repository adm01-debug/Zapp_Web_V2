-- Endurecimento de ACL: RPCs de gamificacao/FSM sem EXECUTE para anon e PUBLIC, e
-- privilegio padrao do schema public sem anon -- que e a causa da reincidencia.
--
-- Medido no banco canonico (tnnnlkbymytvtqngbbqh) em 30/09/2026:
--   * information_schema.routine_privileges estava com grant_agent_achievement
--     EXECUTE para anon e com 9 funcoes com EXECUTE PUBLIC -- as assercoes
--     01-SEC-01 e 01-SEC-03 do proprio repo (scripts/db-tests/01-security-grants.sql)
--     estavam FALHANDO. grant_agent_achievement e SECURITY DEFINER e escreve
--     conquista/XP, ou seja: qualquer requisicao anonima podia chama-la via
--     /rest/v1/rpc/grant_agent_achievement.
--   * o REVOKE ja tinha sido aplicado 3x (20260926200500, 20260927260000,
--     20260927340000) e voltou: CREATE OR REPLACE FUNCTION nas migracoes
--     posteriores (20260927380000, 20260927430000, 20260927500000,
--     20260927580000) reescreve a funcao e a ACL cai de volta no privilegio
--     PADRAO do schema, que concedia EXECUTE a anon por ALTER DEFAULT PRIVILEGES.
-- Por isso este arquivo corrige as duas camadas: o estado vivo e o padrao.
--
-- Escopo: troca EXECUTE apenas dessas funcoes (anon e PUBLIC -> fora;
-- authenticated/service_role -> mantem). Verificado antes de escrever:
-- has_function_privilege('authenticated', oid, 'EXECUTE') = true nas 9, entao
-- nenhuma chamada legitima do app (ex.: src/hooks/gamification/mutations.ts)
-- quebra. Nenhum objeto de tabela existente e tocado.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS assinatura,
           (p.prorettype = 'trigger'::regtype) AS e_trigger
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'set_conversation_status', 'add_agent_xp', 'grant_agent_achievement',
         'increment_agent_messages', 'increment_agent_resolutions', 'update_agent_streak',
         'audit_contact_address_change', 'calculate_level', 'conversation_closure_day',
         'conversation_task_set_assignee', 'conversation_task_state_trigger',
         'enforce_multiplix_dispatch_mutability', 'enforce_multiplix_recipient_mutability',
         'team_receipts_fill_conversation_id'
       )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.assinatura);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.assinatura);
    -- Funcao de trigger nao depende de EXECUTE para disparar; so as chamaveis
    -- por RPC recebem o grant explicito.
    IF NOT r.e_trigger THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.assinatura);
    END IF;
  END LOOP;
END $$;
