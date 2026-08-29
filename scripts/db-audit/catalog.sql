-- Regenera supabase/schema-catalog.json a partir do banco de destino.
-- Uso:
--   psql "$DESTINO_URL" -At -f scripts/db-audit/catalog.sql > supabase/schema-catalog.json
--
-- O guard (supabase-usage-guard.mjs) valida .from()/.rpc() contra este arquivo,
-- o que permite rodar offline no CI, inclusive em PR de fork sem credencial.
-- A secao `columns` usa assinaturas estaveis no formato
-- relacao.coluna:tipo:nulabilidade. Assim o catalog-fresh tambem detecta drift
-- de colunas (nao apenas criacao/remocao de relacoes e funcoes).

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
  'columns',  (SELECT jsonb_agg(
                         format(
                           '%s.%s:%s:%s',
                           c.relname,
                           a.attname,
                           pg_catalog.format_type(a.atttypid, a.atttypmod),
                           CASE WHEN a.attnotnull THEN 'not-null' ELSE 'nullable' END
                         )
                         ORDER BY c.relname, a.attnum
                       )
               FROM pg_attribute a
               JOIN pg_class c ON c.oid = a.attrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public'
                 AND c.relkind IN ('r','p','v','m')
                 AND a.attnum > 0
                 AND NOT a.attisdropped),
  'functions',(SELECT jsonb_agg(DISTINCT p.proname ORDER BY p.proname)
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.prokind = 'f'
                 AND pg_get_function_result(p.oid) <> 'trigger')
));
