-- scripts/db-tests/05-rls-smoke.sql

-- RLS-01: 100% das tabelas publicas tem RLS habilitado
SELECT
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
  '05-RLS-01: 100% das tabelas com RLS habilitado' AS test,
  string_agg(relname, ', ') AS detail
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relrowsecurity = false;

-- RLS-02: tabelas sensiveis tem policies definidas
SELECT
  CASE WHEN COUNT(*) >= 10 THEN 'PASS' ELSE 'FAIL' END AS result,
  '05-RLS-02: tabelas sensiveis tem RLS policies' AS test,
  COUNT(DISTINCT tablename)::text AS detail
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'contacts','messages','profiles','agent_stats',
    'conversation_closures','agent_achievements','audit_logs',
    'department_invites','team_conversations','team_messages'
  );
