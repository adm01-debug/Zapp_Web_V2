DO $$
DECLARE
  _rep text := '';
  r record;
  _n int;
  _cols text;
BEGIN
  -- todas as versoes registradas no ledger para 20260928
  FOR r IN
    SELECT version, name, coalesce((SELECT string_agg(c::text,',') FROM unnest(m.statements) c),'(NULL)') AS stmts
      FROM supabase_migrations.schema_migrations m
     WHERE version LIKE '20260928%' ORDER BY version
  LOOP
    _rep := _rep || 'LR.' || r.version || ' name=' || r.name || ' stmts_len=' || length(r.stmts) || chr(10);
  END LOOP;

  -- ultimas 12 versoes do ledger
  _rep := _rep || '--- ultimas 12 versoes ---' || chr(10);
  FOR r IN
    SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 12
  LOOP
    _rep := _rep || 'LR.last ' || r.version || ' = ' || r.name || chr(10);
  END LOOP;

  SELECT count(*) INTO _n FROM supabase_migrations.schema_migrations;
  _rep := _rep || 'LR.total_ledger=' || _n || chr(10);

  -- colunas da tabela de ledger
  SELECT string_agg(column_name, ',') INTO _cols
    FROM information_schema.columns
   WHERE table_schema='supabase_migrations' AND table_name='schema_migrations';
  _rep := _rep || 'LR.colunas=' || coalesce(_cols,'?') || chr(10) || chr(10);

  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
