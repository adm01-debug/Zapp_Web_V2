-- Prova de vacuidade (RED): restaura por um instante o EXECUTE a authenticated
-- (estado de 20260930113613, ANTES da correcao) e mostra que as assercoes do
-- teste gamification_revoke_client_rpcs.sql FALHARIAM. Tudo dentro de uma
-- transacao abortada: os GRANTs nao persistem.
\set ON_ERROR_STOP on

BEGIN;

GRANT EXECUTE ON FUNCTION public.add_agent_xp(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agent_streak(uuid, boolean) TO authenticated;

DO $$
DECLARE
  v_state text := 'sem erro';
  v_msg   text := '';
  v_uuid  uuid := 'a0000000-0000-0000-0000-000000000001';
BEGIN
  RAISE NOTICE 'RED T1: authenticated tem EXECUTE em add_agent_xp = %',
    has_function_privilege('authenticated', 'public.add_agent_xp(uuid,integer)', 'EXECUTE');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.add_agent_xp(v_uuid, 9999);
    v_state := 'EXECUTOU SEM ERRO (nenhum 42501)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  RAISE NOTICE 'RED T2: chamada direta como authenticated -> % / % (a assercao T2 do teste espera 42501+permission denied)',
    v_state, v_msg;
END $$;

ROLLBACK;

\echo 'RED OK: com o EXECUTE restaurado as assercoes T1/T2 do teste falham (a prova nao e vacua)'
