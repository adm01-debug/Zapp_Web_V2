-- Structural/aggregate audit only: no commands, tokens, objects or customer rows.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';

SELECT jsonb_build_object('section', 'identity', 'database', current_database(),
  'server_major', current_setting('server_version_num')::integer / 10000);

SELECT jsonb_build_object('section', 'autovacuum',
  'enabled', current_setting('autovacuum')::boolean,
  'tables', coalesce(jsonb_agg(jsonb_build_object('table', c.relname,
    'vacuum_scale_factor', (SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name = 'autovacuum_vacuum_scale_factor'),
    'analyze_scale_factor', (SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name = 'autovacuum_analyze_scale_factor'),
    'enabled', coalesce((SELECT option_value::boolean FROM pg_options_to_table(c.reloptions) WHERE option_name = 'autovacuum_enabled'), true)
  ) ORDER BY c.relname), '[]'::jsonb))
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND c.relname IN ('messages', 'email_messages', 'email_threads', 'contacts');

SELECT jsonb_build_object('section', 'realtime',
  'publication_present', EXISTS(SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'),
  'tables', coalesce((SELECT jsonb_agg(schemaname || '.' || tablename ORDER BY schemaname, tablename)
    FROM pg_publication_tables WHERE pubname = 'supabase_realtime'), '[]'::jsonb));

SELECT to_regclass('cron.job') IS NOT NULL AS has_cron,
       to_regclass('storage.buckets') IS NOT NULL AS has_storage,
       to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS has_ledger \gset
\if :has_cron
SELECT jsonb_build_object('section', 'cron', 'available', true, 'jobs', count(*),
  'active_jobs', count(*) FILTER (WHERE active)) FROM cron.job;
\else
SELECT jsonb_build_object('section', 'cron', 'available', false);
\endif
\if :has_storage
SELECT jsonb_build_object('section', 'storage', 'available', true, 'buckets', count(*),
  'public_buckets', count(*) FILTER (WHERE public)) FROM storage.buckets;
\else
SELECT jsonb_build_object('section', 'storage', 'available', false);
\endif
\if :has_ledger
SELECT jsonb_build_object('section', 'ledger_limitations', 'available', true,
  'records', coalesce(jsonb_agg(jsonb_build_object('version', version, 'name', name,
    'statement_count', coalesce(cardinality(statements), 0)) ORDER BY version), '[]'::jsonb))
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260901000002', '20260902023200', '20260902023300', '20260907200000');
\else
SELECT jsonb_build_object('section', 'ledger_limitations', 'available', false, 'records', '[]'::jsonb);
\endif
ROLLBACK;
