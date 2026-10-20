              RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At -c "
                WITH relation AS (
                  SELECT c.oid, c.relrowsecurity
                  FROM pg_class c
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public'
                    AND c.relname = 'webhook_failures'
                    AND c.relkind IN ('r', 'p')
                ), policy_state AS (
                  SELECT
                    count(*) AS policy_count,
                    count(*) FILTER (WHERE 0 = ANY(pol.polroles)) AS public_policy_count,
                    count(*) FILTER (
                      WHERE pol.polname = 'service_role_full'
                        AND pol.polroles = ARRAY['service_role'::regrole::oid]
                        AND pol.polcmd = '*'
                        AND pg_get_expr(pol.polqual, pol.polrelid) = 'true'
                        AND pg_get_expr(pol.polwithcheck, pol.polrelid) = 'true'
                    ) AS service_role_policy_count
                  FROM pg_policy pol
                  JOIN relation r ON r.oid = pol.polrelid
                ), payload AS (
                  SELECT jsonb_build_object(
                    'server_major', current_setting('server_version_num')::int / 10000,
                    'database', current_database(),
                    'table_count', (SELECT count(*) FROM relation),
                    'rls_enabled', COALESCE((SELECT bool_and(relrowsecurity) FROM relation), false),
                    'policy_count', (SELECT policy_count FROM policy_state),
                    'public_policy_count', (SELECT public_policy_count FROM policy_state),
                    'service_role_policy_count', (SELECT service_role_policy_count FROM policy_state),
                    'anon_acl', COALESCE((SELECT has_table_privilege('anon', oid, 'SELECT, INSERT, UPDATE, DELETE') FROM relation), false),
                    'authenticated_acl', COALESCE((SELECT has_table_privilege('authenticated', oid, 'SELECT, INSERT, UPDATE, DELETE') FROM relation), false),
                    'service_role_crud', COALESCE((SELECT
                      has_table_privilege('service_role', oid, 'SELECT')
                      AND has_table_privilege('service_role', oid, 'INSERT')
                      AND has_table_privilege('service_role', oid, 'UPDATE')
                      AND has_table_privilege('service_role', oid, 'DELETE')
                    FROM relation), false),
                    'service_role_extra', COALESCE((SELECT has_table_privilege(
                      'service_role', oid, 'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'
                    ) FROM relation), false)
                  ) AS value
                )
                SELECT (value || jsonb_build_object(
                  'runtime_sha256', encode(sha256(convert_to(value::text, 'UTF8')), 'hex')
                ))::text
                FROM payload;")
