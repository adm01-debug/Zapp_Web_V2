WITH target_relation AS (
  SELECT c.oid, c.relrowsecurity
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'talkx_blacklist'
    AND c.relkind IN ('r', 'p')
), target_policy AS (
  SELECT policy.polcmd, policy.polroles,
         pg_get_expr(policy.polqual, policy.polrelid) AS using_expression,
         pg_get_expr(policy.polwithcheck, policy.polrelid) AS check_expression
  FROM pg_policy AS policy
  JOIN target_relation AS relation ON relation.oid = policy.polrelid
  WHERE policy.polname = 'talkx_blacklist_update'
), payload AS (
  SELECT jsonb_build_object(
    'server_major', current_setting('server_version_num')::integer / 10000,
    'database', current_database(),
    'relation_count', (SELECT count(*) FROM target_relation),
    'rls_enabled', COALESCE((SELECT bool_and(relrowsecurity) FROM target_relation), false),
    'policy_count', (SELECT count(*) FROM target_policy),
    'update_policy_count', (SELECT count(*) FROM target_policy WHERE polcmd = 'w'),
    'authenticated_policy_count', (
      SELECT count(*) FROM target_policy
      WHERE polroles = ARRAY['authenticated'::regrole::oid]
    ),
    'legacy_permissive_count', (
      SELECT count(*) FROM target_policy
      WHERE using_expression = 'true' AND check_expression = 'true'
    ),
    'restricted_policy_count', (
      SELECT count(*) FROM target_policy
      WHERE position('is_admin_or_supervisor(auth.uid())' IN lower(COALESCE(using_expression, ''))) > 0
        AND position('is_admin_or_supervisor(auth.uid())' IN lower(COALESCE(check_expression, ''))) > 0
    )
  ) AS value
)
SELECT (value || jsonb_build_object(
  'runtime_sha256', encode(sha256(convert_to(value::text, 'UTF8')), 'hex')
))::text
FROM payload;
