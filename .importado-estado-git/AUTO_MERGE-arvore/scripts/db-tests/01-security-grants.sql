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

-- Assert 3: zero funcoes com EXECUTE PUBLIC (exceto bucket helpers de sistema)
SELECT
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
  '01-SEC-03: zero EXECUTE PUBLIC em funcoes de negocio' AS test,
  string_agg(routine_name, ', ') AS detail
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND grantee = 'PUBLIC'
  AND routine_name NOT LIKE 'enforce_bucket%';
