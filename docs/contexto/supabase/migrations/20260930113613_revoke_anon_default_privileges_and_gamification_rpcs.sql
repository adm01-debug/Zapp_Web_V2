ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon

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
END $$
