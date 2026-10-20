-- Contrato runtime GENERICO para migrations sem contrato dedicado.
--
-- Por que existe: o db-migrate.yml so aceitava versions com um contrato runtime
-- escrito a mao no proprio workflow. Com 12 contratos e 460 migrations, toda
-- migration nova caia no fallback "Migration sem contrato runtime permitido" e
-- o DDL acabava aplicado fora do workflow, por MCP, sem dry-run nem confirmacao
-- de hash — foi essa a causa dos drifts de setembro/2026.
--
-- O que este contrato prova: NAO prova a semantica da migration alvo (para isso
-- existem os contratos dedicados). Prova que o estado estrutural do schema
-- public e exatamente o mesmo entre o dry-run e o apply, fechando a janela
-- TOCTOU — que e a propriedade de seguranca que o workflow usa para autorizar
-- a aplicacao. Qualquer criacao, remocao ou alteracao de tabela, coluna,
-- funcao (inclusive so o corpo), policy, trigger, constraint ou indice muda o
-- structure_sha256 e, por consequencia, o runtime_sha256 — e o apply aborta.
--
-- Efeito colateral aceito: se OUTRA sessao aplicar qualquer DDL entre o dry-run
-- e o apply, o hash muda e o apply falha fechado. O caminho e repetir o dry-run
-- e usar o hash novo, nunca relaxar a comparacao.
--
-- ORDER BY ... COLLATE "C" e proposital: torna a assinatura independente do
-- locale do cluster, para que o hash dependa so do conteudo do catalogo.
WITH signatures AS (
  SELECT 'rel:' || c.relkind::text || ':' || c.relname || ':' || c.relrowsecurity::text AS sig
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'S')

  UNION ALL
  SELECT 'col:' || c.relname || ':' || a.attname || ':'
    || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text
    || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '')
  FROM pg_attribute AS a
  JOIN pg_class AS c ON c.oid = a.attrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE n.nspname = 'public'
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND c.relkind IN ('r', 'p', 'v', 'm')

  UNION ALL
  SELECT 'fn:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):'
    || p.prosecdef::text || ':' || p.provolatile::text || ':'
    || coalesce(array_to_string(p.proconfig, ','), '') || ':'
    || coalesce(array_to_string(p.proacl::text[], ','), '') || ':'
    || md5(pg_get_functiondef(p.oid))
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'

  UNION ALL
  SELECT 'pol:' || pol.tablename || ':' || pol.policyname || ':' || pol.permissive || ':'
    || coalesce(array_to_string(pol.roles, ','), '') || ':' || pol.cmd || ':'
    || coalesce(pol.qual, '') || ':' || coalesce(pol.with_check, '')
  FROM pg_policies AS pol
  WHERE pol.schemaname = 'public'

  UNION ALL
  SELECT 'trg:' || c.relname || ':' || t.tgname || ':' || md5(pg_get_triggerdef(t.oid))
  FROM pg_trigger AS t
  JOIN pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND NOT t.tgisinternal

  UNION ALL
  SELECT 'con:' || co.conname || ':' || pg_get_constraintdef(co.oid) || ':' || co.convalidated::text
  FROM pg_constraint AS co
  JOIN pg_namespace AS n ON n.oid = co.connamespace
  WHERE n.nspname = 'public'

  UNION ALL
  SELECT 'idx:' || ic.relname || ':' || pg_get_indexdef(i.indexrelid)
  FROM pg_index AS i
  JOIN pg_class AS ic ON ic.oid = i.indexrelid
  JOIN pg_class AS tc ON tc.oid = i.indrelid
  JOIN pg_namespace AS n ON n.oid = tc.relnamespace
  WHERE n.nspname = 'public'
), structure AS (
  SELECT encode(
    sha256(convert_to(coalesce(string_agg(sig, E'\n' ORDER BY sig COLLATE "C"), ''), 'UTF8')),
    'hex'
  ) AS structure_sha256
  FROM signatures
), relation_state AS (
  SELECT
    count(*) FILTER (WHERE c.relkind IN ('r', 'p')) AS table_count,
    count(*) FILTER (WHERE c.relkind = 'v') AS view_count,
    count(*) FILTER (WHERE c.relkind = 'm') AS matview_count,
    count(*) FILTER (WHERE c.relkind IN ('r', 'p') AND c.relrowsecurity) AS rls_enabled_count
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
), function_state AS (
  SELECT
    count(*) AS function_count,
    count(*) FILTER (WHERE p.prosecdef) AS security_definer_count,
    count(*) FILTER (WHERE p.prosecdef AND p.proconfig IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search\_path=%'
      )) AS security_definer_fixed_path_count
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
), policy_state AS (
  SELECT count(*) AS policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
), trigger_state AS (
  SELECT count(*) AS trigger_count
  FROM pg_trigger AS t
  JOIN pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND NOT t.tgisinternal
), constraint_state AS (
  SELECT
    count(*) AS constraint_count,
    count(*) FILTER (WHERE co.convalidated) AS validated_constraint_count
  FROM pg_constraint AS co
  JOIN pg_namespace AS n ON n.oid = co.connamespace
  WHERE n.nspname = 'public'
), index_state AS (
  SELECT count(*) AS index_count
  FROM pg_index AS i
  JOIN pg_class AS tc ON tc.oid = i.indrelid
  JOIN pg_namespace AS n ON n.oid = tc.relnamespace
  WHERE n.nspname = 'public'
), ledger_state AS (
  SELECT count(*) AS ledger_count
  FROM supabase_migrations.schema_migrations
), payload AS (
  SELECT jsonb_build_object(
    'server_major', current_setting('server_version_num')::integer / 10000,
    'database', current_database(),
    'contract', 'generic',
    'table_count', rs.table_count,
    'view_count', rs.view_count,
    'matview_count', rs.matview_count,
    'rls_enabled_count', rs.rls_enabled_count,
    'function_count', fs.function_count,
    'security_definer_count', fs.security_definer_count,
    'security_definer_fixed_path_count', fs.security_definer_fixed_path_count,
    'policy_count', ps.policy_count,
    'trigger_count', ts.trigger_count,
    'constraint_count', cs.constraint_count,
    'validated_constraint_count', cs.validated_constraint_count,
    'index_count', ixs.index_count,
    'ledger_count', ls.ledger_count,
    'structure_sha256', st.structure_sha256
  ) AS value
  FROM relation_state AS rs
  CROSS JOIN function_state AS fs
  CROSS JOIN policy_state AS ps
  CROSS JOIN trigger_state AS ts
  CROSS JOIN constraint_state AS cs
  CROSS JOIN index_state AS ixs
  CROSS JOIN ledger_state AS ls
  CROSS JOIN structure AS st
)
SELECT (value || jsonb_build_object(
  'runtime_sha256', encode(sha256(convert_to(value::text, 'UTF8')), 'hex')
))::text
FROM payload;
