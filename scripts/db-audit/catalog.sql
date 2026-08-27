-- Regenera supabase/schema-catalog.json a partir do banco de destino.
-- Uso:
--   psql "$DESTINO_URL" -At -f scripts/db-audit/catalog.sql > supabase/schema-catalog.json
--
-- O guard (supabase-usage-guard.mjs) valida .from()/.rpc() contra este arquivo,
-- o que permite rodar offline no CI, inclusive em PR de fork sem credencial.

SELECT jsonb_pretty(jsonb_build_object(
  'generated_at', to_char(now(), 'YYYY-MM-DD'),
  'source', current_database() || ' schema public',
  'how_to_regenerate', 'scripts/db-audit/catalog.sql',
  'tables',   (SELECT jsonb_agg(c.relname ORDER BY c.relname)
               FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind IN ('r','p')),
  'views',    (SELECT jsonb_agg(c.relname ORDER BY c.relname)
               FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind IN ('v','m')),
  'functions',(SELECT jsonb_agg(DISTINCT p.proname)
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.prokind = 'f'
                 AND pg_get_function_result(p.oid) <> 'trigger')
));
