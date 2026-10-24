DO $$
DECLARE
  _rep text := '';
  _flag text; _cols text; _acl text; _g text; _role text; _n bigint; _res text;
  r record;
  _roles constant text[] := ARRAY['authenticated','anon','service_role','metabase_reader','dyad_reader','om_reader','postgres','public'];
  _mv text;
  _mvs constant text[] := ARRAY['mv_conversations_summary','mv_top_stickers','mv_instance_metrics','mv_system_status','mv_role_permissions_full'];
BEGIN
  SET LOCAL statement_timeout = '60s';

  -- ================= (d-fix) fn_cookie_health: nomes de saida =================
  FOR r IN
    SELECT p.oid, p.proargnames::text AS argnames, p.proargmodes::text AS argmodes,
           p.proallargtypes::text AS allargtypes, p.prorettype::regtype::text AS rettype,
           p.pronargdefaults, p.prorows::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='zapp' AND p.proname='fn_cookie_health'
  LOOP
    _rep := _rep || 'D.fn_cookie_health argnames=' || coalesce(r.argnames,'(NULL)') || chr(10);
    _rep := _rep || 'D.fn_cookie_health argmodes=' || coalesce(r.argmodes,'(NULL)') || chr(10);
    _rep := _rep || 'D.fn_cookie_health allargtypes=' || coalesce(r.allargtypes,'(NULL)') || chr(10);
    _rep := _rep || 'D.fn_cookie_health rettype=' || r.rettype || ' prorows=' || r.prorows || chr(10);
  END LOOP;

  -- last_probe_preview deve sair NULL (count, sem imprimir conteudo)
  SELECT count(*), count(*) FILTER (WHERE last_probe_preview IS NOT NULL)
    INTO _n, _cols
    FROM zapp.v_cookie_health;
  _rep := _rep || 'C.v_cookie_health rows=' || _n || ' rows_com_last_probe_preview_nao_nulo=' || _cols || chr(10);
  SELECT count(*) FILTER (WHERE last_probe_http IS NOT NULL)
    INTO _cols FROM zapp.v_cookie_health;
  _rep := _rep || 'C.v_cookie_health rows_com_last_probe_http_nao_nulo=' || _cols || chr(10);
  _rep := _rep || chr(10);
  -- coluna last_probe_preview nao pode ser nulavel-errada: conferir NOT NULL do campo
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='zapp' AND table_name='v_cookie_health' AND column_name='last_probe_preview';
  _rep := _rep || 'C.v_cookie_health last_probe_preview_existe_em_information_schema=' || _n || chr(10) || chr(10);

  -- ================= (e) v_system_scorecard =================
  SELECT coalesce(array_to_string(c.reloptions, ','),'(nenhuma)'), coalesce(c.relacl::text,'(NULL=default)')
    INTO _flag,_acl
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='zapp' AND c.relname='v_system_scorecard';
  _rep := _rep || 'E.v_system_scorecard flag=[' || _flag || ']' || chr(10);
  _rep := _rep || 'E.v_system_scorecard acl=' || _acl || chr(10);
  SELECT coalesce(string_agg(a.attname || ':' || format_type(a.atttypid,a.atttypmod), ',' ORDER BY a.attnum),'(sem colunas)')
    INTO _cols
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='zapp' AND c.relname='v_system_scorecard' AND a.attnum>0 AND NOT a.attisdropped;
  _rep := _rep || 'E.v_system_scorecard cols=' || _cols || chr(10);
  _g := '';
  FOREACH _role IN ARRAY _roles LOOP
    _g := _g || _role || '=' || has_table_privilege(_role,'zapp.v_system_scorecard','SELECT') || ' ';
  END LOOP;
  _rep := _rep || 'E.v_system_scorecard SELECT=' || _g || chr(10);
  -- privilegio ZERO: nenhum bit para authenticated em qualquer modo
  _g := '';
  FOREACH _role IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    _g := _g || _role || '=' || has_table_privilege('authenticated','zapp.v_system_scorecard',_role) || ' ';
  END LOOP;
  _rep := _rep || 'E.v_system_scorecard authenticated_any_priv=' || _g || chr(10);
  -- leitura real como authenticated
  BEGIN
    PERFORM set_config('role','authenticated',true);
    EXECUTE 'SELECT count(*) FROM zapp.v_system_scorecard' INTO _n;
    _res := 'OK rows=' || _n;
  EXCEPTION WHEN OTHERS THEN _res := 'ERR[' || SQLSTATE || '] ' || SQLERRM; END;
  RESET ROLE;
  _rep := _rep || 'E.v_system_scorecard read_as_authenticated=' || _res || chr(10);
  -- comentario
  SELECT coalesce(obj_description(c.oid,'pg_class'),'(SEM COMENTARIO)')
    INTO _cols
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='zapp' AND c.relname='v_system_scorecard';
  _rep := _rep || 'E.v_system_scorecard comment=' || _cols || chr(10) || chr(10);

  -- ================= (f) matviews =================
  FOREACH _mv IN ARRAY _mvs LOOP
    SELECT coalesce(array_to_string(c.reloptions, ','),'(nenhuma)'), coalesce(c.relacl::text,'(NULL=default)')
      INTO _flag,_acl
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='zapp' AND c.relname=_mv;
    IF NOT FOUND THEN
      _rep := _rep || 'F.' || _mv || ' AUSENTE' || chr(10);
      CONTINUE;
    END IF;
    _g := '';
    FOREACH _role IN ARRAY _roles LOOP
      _g := _g || _role || '=' || has_table_privilege(_role,'zapp.'||_mv,'SELECT') || ' ';
    END LOOP;
    _rep := _rep || 'F.' || _mv || ' acl=' || _acl || chr(10);
    _rep := _rep || 'F.' || _mv || ' SELECT=' || _g || chr(10);

    -- runtime autenticado
    BEGIN
      PERFORM set_config('role','authenticated',true);
      EXECUTE format('SELECT count(*) FROM zapp.%I',_mv) INTO _n;
      _res := 'OK rows=' || _n;
    EXCEPTION WHEN OTHERS THEN _res := 'ERR[' || SQLSTATE || '] ' || SQLERRM; END;
    RESET ROLE;
    _rep := _rep || 'F.' || _mv || ' read_as_authenticated=' || _res || chr(10);

    -- runtime anon
    BEGIN
      PERFORM set_config('role','anon',true);
      EXECUTE format('SELECT count(*) FROM zapp.%I',_mv) INTO _n;
      _res := 'OK rows=' || _n;
    EXCEPTION WHEN OTHERS THEN _res := 'ERR[' || SQLSTATE || '] ' || SQLERRM; END;
    RESET ROLE;
    _rep := _rep || 'F.' || _mv || ' read_as_anon=' || _res || chr(10);

    -- runtime service_role (postgres E membro)
    BEGIN
      PERFORM set_config('role','service_role',true);
      EXECUTE format('SELECT count(*) FROM zapp.%I',_mv) INTO _n;
      _res := 'OK rows=' || _n;
    EXCEPTION WHEN OTHERS THEN _res := 'ERR[' || SQLSTATE || '] ' || SQLERRM; END;
    RESET ROLE;
    _rep := _rep || 'F.' || _mv || ' read_as_service_role=' || _res || chr(10) || chr(10);
  END LOOP;

  -- ================= (g) realtime publication =================
  SELECT count(*) INTO _n FROM pg_publication_tables WHERE pubname='supabase_realtime';
  _rep := _rep || 'G.realtime_tabelas_no_catalogo=' || _n || chr(10);
  SELECT count(*) INTO _n FROM pg_publication WHERE pubname='supabase_realtime';
  _rep := _rep || 'G.publication_supabase_realtime_existe=' || _n || chr(10);
  SELECT count(*) INTO _n FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='zapp';
  _rep := _rep || 'G.realtime_zapp=' || _n || chr(10);
  SELECT count(*) INTO _n FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='evo';
  _rep := _rep || 'G.realtime_evo=' || _n || chr(10);

  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
