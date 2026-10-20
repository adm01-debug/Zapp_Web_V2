              RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At -c "
                WITH payload AS (
                  SELECT jsonb_build_object(
                    'server_major', current_setting('server_version_num')::int / 10000,
                    'database', current_database(),
                    'lease_column_count', (
                      SELECT count(*) FROM information_schema.columns
                      WHERE table_schema='public' AND table_name='crm_sync_outbox' AND column_name='lease_token'
                    ),
                    'new_complete_count', (
                      SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                      WHERE n.nspname='public' AND p.proname='complete_crm_sync_outbox'
                        AND pg_get_function_identity_arguments(p.oid)='p_id uuid, p_lease_token uuid, p_interaction_id text, p_contact_id text, p_company_id text'
                    ),
                    'old_complete_count', (
                      SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                      WHERE n.nspname='public' AND p.proname='complete_crm_sync_outbox'
                        AND pg_get_function_identity_arguments(p.oid)='p_id uuid, p_interaction_id text, p_contact_id text, p_company_id text'
                    ),
                    'new_fail_count', (
                      SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                      WHERE n.nspname='public' AND p.proname='fail_crm_sync_outbox'
                        AND pg_get_function_identity_arguments(p.oid)='p_id uuid, p_lease_token uuid, p_error_code text'
                    ),
                    'state_constraint_count', (
                      SELECT count(*) FROM pg_constraint
                      WHERE conrelid='public.crm_sync_outbox'::regclass
                        AND conname IN ('crm_sync_outbox_lease_state','crm_sync_outbox_success_state','crm_sync_outbox_phone_state')
                    )
                  ) AS value
                )
                SELECT (value || jsonb_build_object(
                  'runtime_sha256', encode(sha256(convert_to(value::text, 'UTF8')), 'hex')
                ))::text FROM payload;")
