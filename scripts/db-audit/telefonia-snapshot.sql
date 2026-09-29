-- Snapshot do contrato de Telefonia (etapas T04 e T93 do plano de finalizacao).
--
-- Uso:
--   psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At \
--     -f scripts/db-audit/telefonia-snapshot.sql > <saida>.json
--
-- Imprime UMA linha com o JSON canonico do escopo `calls`: colunas, policies,
-- constraints, indices, as 5 funcoes do modulo (assinatura, atributos e
-- definicao viva) e contagens por status/direcao/canal. Serve para diff entre
-- execucoes (T04 vs T93): nenhuma secao depende de OID nem da ordem fisica do
-- catalogo, e `jsonb` canonicaliza a ordem das chaves.

SELECT jsonb_build_object(
  'format_version', 1,
  'generated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'source', current_database() || ' schema public',
  'scope', jsonb_build_object('relation', 'public.calls', 'functions', jsonb_build_array(
    'my_calls_kpi', 'record_incoming_call_event', 'search_my_calls',
    'set_call_agent_notes', 'upsert_my_call')),

  'columns', (
    SELECT coalesce(jsonb_agg(rotulo ORDER BY rotulo), '[]'::jsonb)
    FROM (
      SELECT c.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod)
             || ':' || CASE WHEN a.attnotnull THEN 'not null' ELSE 'null' END AS rotulo
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'calls' AND a.attnum > 0 AND NOT a.attisdropped
    ) t
  ),

  'policies', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'name', policyname, 'cmd', cmd, 'roles', roles,
             'qual', qual, 'with_check', with_check) ORDER BY policyname), '[]'::jsonb)
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calls'
  ),

  'constraints', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'name', conname, 'type', contype,
             'definition', pg_get_constraintdef(oid)) ORDER BY conname), '[]'::jsonb)
    FROM pg_constraint WHERE conrelid = 'public.calls'::regclass
  ),

  'indexes', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'name', indexname, 'definition', indexdef) ORDER BY indexname), '[]'::jsonb)
    FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'calls'
  ),

  'functions', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'signature', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
             'returns', pg_get_function_result(p.oid),
             'kind', p.prokind,
             'security_definer', p.prosecdef,
             'volatility', p.provolatile,
             'owner', pg_get_userbyid(p.proowner),
             'acl', coalesce(p.proacl::text, 'default'),
             'definition', pg_get_functiondef(p.oid)) ORDER BY p.proname), '[]'::jsonb)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('my_calls_kpi', 'record_incoming_call_event', 'search_my_calls',
                        'set_call_agent_notes', 'upsert_my_call')
  ),

  'realtime_publication', (
    SELECT coalesce(jsonb_agg(tablename ORDER BY tablename), '[]'::jsonb)
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'calls'
  ),

  'counts', jsonb_build_object(
    'total', (SELECT count(*) FROM public.calls),
    'by_status', (
      SELECT coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
      FROM (SELECT coalesce(status, 'null') AS status, count(*) AS total
            FROM public.calls GROUP BY 1) s),
    'by_direction', (
      SELECT coalesce(jsonb_object_agg(direction, total), '{}'::jsonb)
      FROM (SELECT coalesce(direction, 'null') AS direction, count(*) AS total
            FROM public.calls GROUP BY 1) s),
    'by_channel', (
      SELECT coalesce(jsonb_object_agg(channel, total), '{}'::jsonb)
      FROM (SELECT coalesce(channel, 'null') AS channel, count(*) AS total
            FROM public.calls GROUP BY 1) s),
    'ringing_older_than_1_day', (
      SELECT count(*) FROM public.calls
      WHERE status = 'ringing' AND started_at < now() - interval '1 day')
  )
);
