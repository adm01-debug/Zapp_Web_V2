              RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At -c "
                WITH target_relation AS (
                  SELECT c.oid
                  FROM pg_class c
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname='public' AND c.relname='global_settings'
                    AND c.relkind IN ('r','p')
                ), payload AS (
                  SELECT jsonb_build_object(
                    'server_major', current_setting('server_version_num')::int / 10000,
                    'database', current_database(),
                    'relation_count', (SELECT count(*) FROM target_relation),
                    'legacy_token_count', (
                      SELECT count(*) FROM public.global_settings WHERE key='api_token'
                    ),
                    'constraint_count', (
                      SELECT count(*) FROM pg_constraint
                      WHERE conrelid='public.global_settings'::regclass
                        AND conname='global_settings_no_plaintext_api_token'
                    ),
                    'validated_constraint_count', (
                      SELECT count(*) FROM pg_constraint
                      WHERE conrelid='public.global_settings'::regclass
                        AND conname='global_settings_no_plaintext_api_token'
                        AND convalidated
                    )
                  ) AS value
                )
                SELECT (value || jsonb_build_object(
                  'runtime_sha256', encode(sha256(convert_to(value::text, 'UTF8')), 'hex')
                ))::text FROM payload;")
