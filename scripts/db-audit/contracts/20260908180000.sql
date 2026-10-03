              RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At -c "
                WITH relations AS (
                  SELECT c.relname, c.relrowsecurity
                  FROM pg_class c
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public'
                    AND c.relname IN ('crm_contact_links', 'crm_sync_outbox')
                    AND c.relkind IN ('r', 'p')
                ), functions AS (
                  SELECT p.proname, p.prosecdef,
                         COALESCE('search_path=public, pg_temp' = ANY(p.proconfig), false) AS safe_path
                  FROM pg_proc p
                  JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public'
                    AND p.proname IN (
                      'enqueue_crm_sync_from_closure', 'claim_crm_sync_outbox',
                      'claim_crm_sync_outbox_by_id', 'complete_crm_sync_outbox',
                      'fail_crm_sync_outbox', 'get_crm_sync_health'
                    )
                ), triggers AS (
                  SELECT count(*) AS n
                  FROM pg_trigger t
                  JOIN pg_class c ON c.oid = t.tgrelid
                  JOIN pg_namespace ns ON ns.oid = c.relnamespace
                  WHERE ns.nspname = 'public'
                    AND c.relname = 'conversation_closures'
                    AND t.tgname = 'trg_enqueue_crm_sync_from_closure'
                    AND NOT t.tgisinternal
                ), payload AS (
                  SELECT jsonb_build_object(
                    'server_major', current_setting('server_version_num')::int / 10000,
                    'database', current_database(),
                    'table_count', (SELECT count(*) FROM relations),
                    'rls_count', (SELECT count(*) FROM relations WHERE relrowsecurity),
                    'function_count', (SELECT count(*) FROM functions),
                    'safe_function_count', (SELECT count(*) FROM functions WHERE prosecdef AND safe_path),
                    'trigger_count', (SELECT n FROM triggers)
                  ) AS value
                )
                SELECT (value || jsonb_build_object(
                  'runtime_sha256', encode(sha256(convert_to(value::text, 'UTF8')), 'hex')
                ))::text
                FROM payload;")
