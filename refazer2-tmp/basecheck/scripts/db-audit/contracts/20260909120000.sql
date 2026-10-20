              RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At -c "
                WITH expected_functions AS (
                  SELECT p.oid, p.proname, p.prosecdef,
                         COALESCE('search_path=public, pg_temp' = ANY(p.proconfig), false) AS safe_path
                  FROM pg_proc p
                  JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public'
                    AND p.proname IN (
                      'merge_contacts_atomic', 'upsert_crm_contact_link_guarded',
                      'cleanup_crm_sync_outbox'
                    )
                ), payload AS (
                  SELECT jsonb_build_object(
                    'server_major', current_setting('server_version_num')::int / 10000,
                    'database', current_database(),
                    'table_count', (
                      SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                      WHERE n.nspname='public' AND c.relname IN ('crm_contact_links','crm_sync_outbox')
                        AND c.relkind IN ('r','p')
                    ),
                    'constraint_count', (
                      SELECT count(*) FROM pg_constraint
                      WHERE conrelid='public.crm_sync_outbox'::regclass
                        AND conname IN (
                          'crm_sync_outbox_payload_size','crm_sync_outbox_external_ids_bounded',
                          'crm_sync_outbox_lease_state','crm_sync_outbox_success_state',
                          'crm_sync_outbox_phone_state'
                        )
                    ),
                    'validated_constraint_count', (
                      SELECT count(*) FROM pg_constraint
                      WHERE conrelid='public.crm_sync_outbox'::regclass AND convalidated
                        AND conname IN (
                          'crm_sync_outbox_payload_size','crm_sync_outbox_external_ids_bounded',
                          'crm_sync_outbox_lease_state','crm_sync_outbox_success_state',
                          'crm_sync_outbox_phone_state'
                        )
                    ),
                    'function_count', (SELECT count(*) FROM expected_functions),
                    'safe_function_count', (
                      SELECT count(*) FROM expected_functions WHERE prosecdef AND safe_path
                    ),
                    'flag_count', (SELECT count(*) FROM public.feature_flags WHERE key='crm.integration'),
                    'flag_enabled', COALESCE((
                      SELECT enabled FROM public.feature_flags WHERE key='crm.integration'
                    ), false)
                  ) AS value
                )
                SELECT (value || jsonb_build_object(
                  'runtime_sha256', encode(sha256(convert_to(value::text, 'UTF8')), 'hex')
                ))::text FROM payload;")
