DO $$
DECLARE
  _rep text := '';
  _flag text;
  _cols text;
  _acl text;
  _g text;
  _role text;
  _roles constant text[] := ARRAY['authenticated','anon','service_role','metabase_reader','dyad_reader','om_reader','postgres','supabase_admin','public'];
  _n bigint;
  _res text;
  r record;
BEGIN
  -- ---------- (c) v_cookie_health ----------
  SELECT coalesce(array_to_string(c.reloptions, ','), '(nenhuma)'), coalesce(c.relacl::text,'(NULL=default)')
    INTO _flag, _acl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='zapp' AND c.relname='v_cookie_health';

  SELECT coalesce(string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum), '(sem colunas)')
    INTO _cols
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='zapp' AND c.relname='v_cookie_health' AND a.attnum>0 AND NOT a.attisdropped;

  _rep := _rep || 'C.v_cookie_health flag=[' || _flag || ']' || chr(10);
  _rep := _rep || 'C.v_cookie_health acl=' || _acl || chr(10);
  _rep := _rep || 'C.v_cookie_health cols=' || _cols || chr(10);

  _g := '';
  FOREACH _role IN ARRAY _roles LOOP
    _g := _g || _role || '=' || has_table_privilege(_role,'zapp.v_cookie_health','SELECT') || ' ';
  END LOOP;
  _rep := _rep || 'C.v_cookie_health SELECT=' || _g || chr(10);

  PERFORM set_config('role','authenticated',true);
  BEGIN
    EXECUTE 'SELECT count(*) FROM zapp.v_cookie_health' INTO _n;
    _res := 'OK rows=' || _n;
  EXCEPTION WHEN OTHERS THEN _res := 'ERR[' || SQLSTATE || '] ' || SQLERRM; END;
  RESET ROLE;
  _rep := _rep || 'C.v_cookie_health read_as_authenticated=' || _res || chr(10);

  PERFORM set_config('role','anon',true);
  BEGIN
    EXECUTE 'SELECT count(*) FROM zapp.v_cookie_health' INTO _n;
    _res := 'OK rows=' || _n;
  EXCEPTION WHEN OTHERS THEN _res := 'ERR[' || SQLSTATE || '] ' || SQLERRM; END;
  RESET ROLE;
  _rep := _rep || 'C.v_cookie_health read_as_anon=' || _res || chr(10);

  -- leitores de BI reais (SET ROLE exige membership; postgres NAO e membro destes —
  -- se nao puder, registra a limitacao em vez de abortar o relatorio)
  FOREACH _role IN ARRAY ARRAY['metabase_reader','dyad_reader','om_reader','service_role'] LOOP
    BEGIN
      PERFORM set_config('role',_role,true);
      EXECUTE 'SELECT count(*) FROM zapp.v_cookie_health' INTO _n;
      _res := 'OK rows=' || _n;
    EXCEPTION WHEN OTHERS THEN _res := 'ERR[' || SQLSTATE || '] ' || SQLERRM; END;
    RESET ROLE;
    _rep := _rep || 'C.v_cookie_health read_as_' || _role || '=' || _res || chr(10);
  END LOOP;

  _rep := _rep || chr(10);

  -- ---------- (d) zapp.fn_cookie_health() ----------
  FOR r IN
    SELECT p.oid, p.proname,
           p.prosecdef,
           p.proconfig::text AS proconfig,
           p.proacl::text AS proacl,
           pg_get_userbyid(p.proowner) AS owner,
           p.prorettype::regtype::text AS rettype,
           p.provolatile::text AS vol
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='zapp' AND p.proname='fn_cookie_health'
  LOOP
    _rep := _rep || 'D.fn_cookie_health oid=' || r.oid || ' secdef=' || r.prosecdef::text || ' owner=' || r.owner::text || ' volatile=' || r.vol::text || chr(10);
    _rep := _rep || 'D.fn_cookie_health proconfig=' || coalesce(r.proconfig::text,'(NULL)') || chr(10);
    _rep := _rep || 'D.fn_cookie_health proacl=' || coalesce(r.proacl,'(NULL=default)') || chr(10);

    _g := '';
    FOREACH _role IN ARRAY ARRAY['public','authenticated','anon','service_role','metabase_reader','dyad_reader','om_reader','postgres'] LOOP
      _g := _g || _role || '=' || has_function_privilege(_role, r.oid, 'EXECUTE') || ' ';
    END LOOP;
    _rep := _rep || 'D.fn_cookie_health EXECUTE=' || _g || chr(10);

    -- retorno: TABLE(...) -> colunas em ordem
    SELECT coalesce(string_agg(a.attname || ':' || format_type(a.atttypid,a.atttypmod), ',' ORDER BY a.attnum),'(sem colunas)')
      INTO _cols
      FROM pg_attribute a WHERE a.attrelid = r.oid AND a.attnum>0 AND NOT a.attisdropped;
    _rep := _rep || 'D.fn_cookie_health returns_table_cols=' || _cols || chr(10);

    -- rodar a funcao como authenticated
    PERFORM set_config('role','authenticated',true);
    BEGIN
      EXECUTE 'SELECT count(*) FROM zapp.fn_cookie_health()' INTO _n;
      _res := 'OK rows=' || _n;
    EXCEPTION WHEN OTHERS THEN _res := 'ERR[' || SQLSTATE || '] ' || SQLERRM; END;
    RESET ROLE;
    _rep := _rep || 'D.fn_cookie_health exec_as_authenticated=' || _res || chr(10);
  END LOOP;

  -- ---------- (d2) zapp.cookie_probe_log continua service-only? ----------
  SELECT coalesce(c.relrowsecurity::text,'?'), coalesce(c.relforcerowsecurity::text,'?'), coalesce(c.relacl::text,'(NULL=default)')
    INTO _flag, _cols, _acl
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='zapp' AND c.relname='cookie_probe_log';
  _rep := _rep || 'D2.cookie_probe_log rls_enabled=' || _flag || ' rls_forced=' || _cols || chr(10);
  _rep := _rep || 'D2.cookie_probe_log acl=' || _acl || chr(10);

  _g := '';
  FOREACH _role IN ARRAY ARRAY['authenticated','anon','service_role','metabase_reader','dyad_reader','om_reader','postgres'] LOOP
    _g := _g || _role || '=' || has_table_privilege(_role,'zapp.cookie_probe_log','SELECT') || ' ';
  END LOOP;
  _rep := _rep || 'D2.cookie_probe_log SELECT=' || _g || chr(10);

  FOR r IN
    SELECT pol.polname, pol.polcmd, coalesce(array_to_string(pol.polroles::regrole[]::text[], ','),'(todas)') AS roles, pg_get_expr(pol.polqual, pol.polrelid) AS using_expr
      FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='zapp' AND c.relname='cookie_probe_log'
  LOOP
    _rep := _rep || 'D2.policy ' || r.polname || ' cmd=' || r.polcmd::text || ' roles=' || r.roles || ' using=' || coalesce(r.using_expr,'(none)') || chr(10);
  END LOOP;

  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
