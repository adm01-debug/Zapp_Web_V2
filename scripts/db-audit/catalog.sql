-- Regenera supabase/schema-catalog.json a partir do banco de destino.
-- Uso:
--   psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At \
--     -f scripts/db-audit/catalog.sql > supabase/schema-catalog.json
--
-- O guard (supabase-usage-guard.mjs) valida .from()/.rpc() contra este arquivo,
-- o que permite rodar offline no CI, inclusive em PR de fork sem credencial.
-- A secao `columns` usa assinaturas estaveis no formato
-- relacao.coluna:tipo:nulabilidade. `function_signatures` preserva overloads e
-- inclui argumentos de identidade, retorno e prokind. Nenhuma secao depende de
-- OID ou da ordem fisica do catalogo.

SELECT jsonb_pretty(jsonb_build_object(
  'format_version', 2,
  'generated_at', to_char(now(), 'YYYY-MM-DD'),
  'source', current_database() || ' schema public',
  'database_identity', jsonb_build_object(
    'database', current_database(),
    'schema', 'public',
    'server_major', current_setting('server_version_num')::integer / 10000
  ),
  'how_to_regenerate', 'scripts/db-audit/catalog.sql',
  'tables',   (SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname), '[]'::jsonb)
               FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind IN ('r','p')),
  'views',    (SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname), '[]'::jsonb)
               FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind IN ('v','m')),
  'columns',  (SELECT coalesce(jsonb_agg(
                         format(
                           '%s.%s:%s:%s',
                           c.relname,
                           a.attname,
                           pg_catalog.format_type(a.atttypid, a.atttypmod),
                           CASE WHEN a.attnotnull THEN 'not-null' ELSE 'nullable' END
                         )
                         ORDER BY c.relname, a.attnum
                       ), '[]'::jsonb)
               FROM pg_attribute a
               JOIN pg_class c ON c.oid = a.attrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public'
                 AND c.relkind IN ('r','p','v','m')
                 AND a.attnum > 0
                 AND NOT a.attisdropped),
  'functions',(SELECT coalesce(jsonb_agg(DISTINCT p.proname ORDER BY p.proname), '[]'::jsonb)
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.prokind = 'f'
                 AND pg_get_function_result(p.oid) <> 'trigger'),
  'function_signatures',
              (SELECT coalesce(jsonb_agg(
                         format(
                           '%s(%s)->%s|kind=%s',
                           p.proname,
                           pg_get_function_identity_arguments(p.oid),
                           pg_get_function_result(p.oid),
                           p.prokind
                         )
                         ORDER BY p.proname, pg_get_function_identity_arguments(p.oid),
                                  pg_get_function_result(p.oid), p.prokind
                       ), '[]'::jsonb)
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.prokind = 'f'
                 AND pg_get_function_result(p.oid) <> 'trigger')
));
