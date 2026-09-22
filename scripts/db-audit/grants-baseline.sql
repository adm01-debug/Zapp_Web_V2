-- Regenera scripts/db-audit/grants-baseline.json a partir do banco de destino.
-- Uso:
--   psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At \
--     -f scripts/db-audit/grants-baseline.sql > scripts/db-audit/grants-baseline.json
--
-- E26: snapshot de EXECUTE por role para toda funcao publica, mais SELECT de
-- `anon` em toda tabela/view publica. O incidente de 2026-09-04 (REVOKE
-- antes do codigo -> lockout de login) e os 3+ achados de anon-EXECUTE
-- indevido nesta mesma sessao (2026-09-16) provam que ACL e o ponto mais
-- sensivel deste banco -- este arquivo vira o baseline diffavel para
-- detectar qualquer novo GRANT a anon/authenticated introduzido sem
-- migration explicita.
SELECT jsonb_pretty(jsonb_build_object(
  'generated_at', to_char(now(), 'YYYY-MM-DD'),
  'how_to_regenerate', 'scripts/db-audit/grants-baseline.sql (E26)',
  'note', 'Regenerar apos qualquer GRANT/REVOKE e revisar o diff antes de commitar.',
  'anon_execute', (
    -- ORDER BY posicional nao funciona dentro de agregacao (ordenava pela
    -- constante 1 = ordem indefinida); a expressao explicita torna o array
    -- deterministico entre regeneracoes (E10/gate de paridade tripla).
    SELECT coalesce(jsonb_agg(format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) ORDER BY format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid))), '[]'::jsonb)
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  'authenticated_execute_count', (
    SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  'service_role_execute_count', (
    SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')
  ),
  'anon_table_select', (
    SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname), '[]'::jsonb)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
      AND has_table_privilege('anon', c.oid, 'SELECT')
  )
));
