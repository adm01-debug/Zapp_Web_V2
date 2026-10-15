-- scripts/db-tests/01-security-grants.sql
-- Assert 1: anon nao tem EXECUTE em nenhuma das 6 funcoes de gamificacao+FSM
SELECT
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
  '01-SEC-01: anon sem EXECUTE em funcoes criticas' AS test,
  COUNT(*)::text AS detail
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND grantee = 'anon'
  AND routine_name IN (
    'set_conversation_status','add_agent_xp','grant_agent_achievement',
    'increment_agent_messages','increment_agent_resolutions','update_agent_streak'
  );

-- Assert 2: zero SECURITY DEFINER sem search_path fixo
SELECT
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
  '01-SEC-02: zero SECURITY DEFINER sem search_path' AS test,
  string_agg(proname, ', ') AS detail
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prosecdef = true
  AND (p.proconfig IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
  ));

-- Assert 3: zero funcoes de NEGOCIO com EXECUTE PUBLIC (exceto bucket helpers
-- de sistema). t_6dafc78a (refazer 1): o replay produz 4 funções com EXECUTE
-- PUBLIC, todas `RETURNS trigger` — handlers invocados pelo motor via
-- `EXECUTE FUNCTION` nos triggers, não funções de negócio chamáveis por RPC:
--   multiplix_audiences_validate_shared_roles (20261001261230, trigger BEFORE),
--   enforce_department_invitations_code_format_on_insert (20261007012808, trigger),
--   trg_user_sessions_auth_session_guard (20261004181921, trigger BEFORE),
--   trg_revoke_sessions_on_profile_deactivate (20261004181921, trigger).
-- Medido no replay em 14/10 (as 4 têm prorettype='trigger' no catálogo). O GRANT
-- PUBLIC nelas é o default do CREATE FUNCTION, não decisão de produto; a
-- checagem continua falhando se qualquer função de negócio (não-trigger) ganhar
-- EXECUTE PUBLIC.
SELECT
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
  '01-SEC-03: zero EXECUTE PUBLIC em funcoes de negocio (exceto triggers)' AS test,
  string_agg(routine_name, ', ') AS detail
FROM information_schema.routine_privileges rp
WHERE routine_schema = 'public'
  AND grantee = 'PUBLIC'
  AND routine_name NOT LIKE 'enforce_bucket%'
  AND routine_name NOT IN (
    SELECT p.proname
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prorettype = 'trigger'::regtype
  );
