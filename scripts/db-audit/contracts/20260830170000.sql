              RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At -c "
                WITH fn AS (
                  SELECT p.oid, p.prosecdef, p.provolatile, p.proconfig,
                         pg_get_functiondef(p.oid) AS body
                  FROM pg_proc p
                  JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='get_team_profiles'
                    AND pg_get_function_identity_arguments(p.oid)=''
                )
                SELECT json_build_object(
                  'server_major', current_setting('server_version_num')::int / 10000,
                  'database', current_database(),
                  'function_count', count(*),
                  'security_definer', bool_and(prosecdef),
                  'stable', bool_and(provolatile='s'),
                  'search_path_fixed', bool_and('search_path=public' = ANY(proconfig)),
                  'filters_active', bool_and(position('where p.is_active = true' in lower(body)) > 0),
                  'runtime_sha256', min(encode(sha256(convert_to(body, 'UTF8')), 'hex'))
                )::text
                FROM fn;")
