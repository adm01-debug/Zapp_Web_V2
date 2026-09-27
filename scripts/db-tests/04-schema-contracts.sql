-- scripts/db-tests/04-schema-contracts.sql

-- SCHEMA-01: CHECK conversation_status existe
SELECT
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result,
  '04-SCHEMA-01: CHECK chk_conversation_status_values existe' AS test,
  COUNT(*)::text AS detail
FROM information_schema.table_constraints
WHERE table_schema = 'public' AND table_name = 'contacts'
  AND constraint_name = 'chk_conversation_status_values';

-- SCHEMA-02: CHECK xp >= 0 existe
SELECT
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result,
  '04-SCHEMA-02: CHECK chk_xp_non_negative existe' AS test,
  COUNT(*)::text AS detail
FROM information_schema.table_constraints
WHERE table_schema = 'public' AND table_name = 'agent_stats'
  AND constraint_name = 'chk_xp_non_negative';

-- SCHEMA-03: 4 FKs cobertas por indice
SELECT
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
  '04-SCHEMA-03: zero FK sem indice cobrindo (tabelas team_conversations, team_message_receipts, dept_audit_logs, dept_invites)' AS test,
  COUNT(*)::text AS detail
FROM pg_constraint con
WHERE con.contype = 'f'
  AND con.connamespace = 'public'::regnamespace
  AND con.conrelid IN (
    'public.team_conversations'::regclass,
    'public.team_message_receipts'::regclass,
    'public.department_audit_logs'::regclass,
    'public.department_invites'::regclass
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = con.conrelid
      AND (i.indkey::int2[])[0:array_length(con.conkey,1)-1] @> con.conkey
  );

-- SCHEMA-04: avg_response_time_seconds DEFAULT removido
SELECT
  CASE WHEN pg_get_expr(d.adbin, d.adrelid) IS NULL THEN 'PASS' ELSE 'FAIL' END AS result,
  '04-SCHEMA-04: avg_response_time_seconds sem DEFAULT' AS test,
  COALESCE(pg_get_expr(d.adbin, d.adrelid), 'NULL') AS detail
FROM pg_attribute a
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = 'public.agent_stats'::regclass
  AND a.attname = 'avg_response_time_seconds';
