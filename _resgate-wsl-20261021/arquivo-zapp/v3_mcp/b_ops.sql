DO $$
DECLARE
  v record;
  _rep text := '';
  _flag text;
  _cols text;
  _acl text;
  _g text;
  _n bigint;
  _res text;
  r record;
  _roles constant text[] := ARRAY['authenticated','anon','service_role','metabase_reader','dyad_reader','om_reader','postgres','supabase_admin'];
  _role text;
BEGIN
  FOR v IN
    SELECT unnest(ARRAY['zapp_dash_daily','zapp_dash_heatmap','zapp_dash_overview','zapp_dash_top_contacts','zapp_inbox_threads']) AS relname
  LOOP
    SELECT coalesce(array_to_string(c.reloptions, ','), '(nenhuma)')
      INTO _flag
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'zapp' AND c.relname = v.relname;

    -- contrato de colunas (nome/tipo, na ordem)
    SELECT coalesce(string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum), '(sem colunas)')
      INTO _cols
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'zapp' AND c.relname = v.relname AND a.attnum > 0 AND NOT a.attisdropped;

    SELECT coalesce(c.relacl::text, '(NULL=default)')
      INTO _acl
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'zapp' AND c.relname = v.relname;

    _g := '';
    FOREACH _role IN ARRAY _roles LOOP
      _g := _g || _role || '=' || has_table_privilege(_role, 'zapp.' || v.relname, 'SELECT') || ' ';
    END LOOP;

    _rep := _rep || 'B.' || v.relname || ' flag=[' || _flag || ']' || chr(10);
    _rep := _rep || 'B.' || v.relname || ' acl=' || _acl || chr(10);
    _rep := _rep || 'B.' || v.relname || ' SELECT=' || _g || chr(10);
    _rep := _rep || 'B.' || v.relname || ' cols=' || _cols || chr(10);

    -- leitura real como authenticated
    PERFORM set_config('role', 'authenticated', true);
    BEGIN
      EXECUTE format('SELECT count(*) FROM zapp.%I', v.relname) INTO _n;
      _res := 'OK rows=' || _n;
    EXCEPTION WHEN OTHERS THEN
      _res := 'ERR[' || SQLSTATE || '] ' || SQLERRM;
    END;
    RESET ROLE;
    _rep := _rep || 'B.' || v.relname || ' read_as_authenticated=' || _res || chr(10);

    -- leitura real como anon
    PERFORM set_config('role', 'anon', true);
    BEGIN
      EXECUTE format('SELECT count(*) FROM zapp.%I', v.relname) INTO _n;
      _res := 'OK rows=' || _n;
    EXCEPTION WHEN OTHERS THEN
      _res := 'ERR[' || SQLSTATE || '] ' || SQLERRM;
    END;
    RESET ROLE;
    _rep := _rep || 'B.' || v.relname || ' read_as_anon=' || _res || chr(10);

    _rep := _rep || chr(10);
  END LOOP;

  -- bases: quem pode ler evo.active_messages (fonte ANTIGA) x zapp.evolution_messages (fonte NOVA)
  FOR r IN
    SELECT c.oid, n.nspname || '.' || c.relname AS fullname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('v','r','m')
       AND ((n.nspname='evo' AND c.relname='active_messages')
         OR (n.nspname='evo' AND c.relname='evolution_messages')
         OR (n.nspname='zapp' AND c.relname='evolution_messages')
         OR (n.nspname='evo' AND c.relname='evolution_contacts'))
     ORDER BY 2
  LOOP
    _g := '';
    FOREACH _role IN ARRAY _roles LOOP
      _g := _g || _role || '=' || has_table_privilege(_role, r.oid, 'SELECT') || ' ';
    END LOOP;
    _rep := _rep || 'B.base.' || r.fullname || ' SELECT=' || _g || chr(10);
  END LOOP;

  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
