-- Assinatura estrutural do schema public, por objeto, via MD5.
-- Rode nos DOIS bancos e passe as saidas para diff.mjs.
--
--   psql "$ORIGEM_URL"  -At -f scripts/db-audit/manifest.sql > /tmp/src.json
--   psql "$DESTINO_URL" -At -f scripts/db-audit/manifest.sql > /tmp/dst.json
--   node scripts/db-audit/diff.mjs /tmp/src.json /tmp/dst.json
--
-- Por que hash por objeto e nao contagem: contagens iguais escondem objetos
-- trocados. Na auditoria de 27/08/2026 as constraints batiam em numero mas 34
-- tabelas divergiam - todas por FK apontando para a mesma tabela.

WITH cons AS (
  SELECT c.relname AS t,
         md5(string_agg(co.conname || '~' || pg_get_constraintdef(co.oid), ',' ORDER BY co.conname)) AS h
  FROM pg_constraint co
  JOIN pg_class c ON c.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = co.connamespace
  WHERE n.nspname = 'public' GROUP BY 1
), idx AS (
  SELECT tablename AS t, md5(string_agg(indexname || '~' || indexdef, ',' ORDER BY indexname)) AS h
  FROM pg_indexes WHERE schemaname = 'public' GROUP BY 1
), pol AS (
  SELECT tablename AS t,
         md5(string_agg(policyname || '~' || cmd || '~' || coalesce(qual,'-') || '~' ||
             coalesce(with_check,'-') || '~' || array_to_string(roles,'+'), ',' ORDER BY policyname)) AS h
  FROM pg_policies WHERE schemaname = 'public' GROUP BY 1
), trg AS (
  SELECT c.relname AS t, md5(string_agg(tg.tgname || '~' || pg_get_triggerdef(tg.oid), ',' ORDER BY tg.tgname)) AS h
  FROM pg_trigger tg
  JOIN pg_class c ON c.oid = tg.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT tg.tgisinternal GROUP BY 1
), col AS (
  SELECT table_name AS t,
         md5(string_agg(column_name || '|' || data_type || '|' || is_nullable || '|' ||
             coalesce(column_default,'-'), ',' ORDER BY column_name)) AS h
  FROM information_schema.columns WHERE table_schema = 'public' GROUP BY 1
), fn AS (
  SELECT p.proname AS t, md5(string_agg(pg_get_functiondef(p.oid), ',' ORDER BY p.oid)) AS h
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' GROUP BY 1
)
SELECT jsonb_build_object(
  'db',    current_database(),
  'when',  now(),
  'col',  (SELECT jsonb_object_agg(t,h) FROM col),
  'cons', (SELECT jsonb_object_agg(t,h) FROM cons),
  'idx',  (SELECT jsonb_object_agg(t,h) FROM idx),
  'pol',  (SELECT jsonb_object_agg(t,h) FROM pol),
  'trg',  (SELECT jsonb_object_agg(t,h) FROM trg),
  'fn',   (SELECT jsonb_object_agg(t,h) FROM fn),
  'grants_hash', (SELECT md5(string_agg(grantee || '|' || table_name || '|' || privilege_type, ','
                     ORDER BY grantee, table_name, privilege_type))
                  FROM information_schema.role_table_grants
                  WHERE table_schema = 'public' AND grantee <> 'sandbox_exec')
)::text;
