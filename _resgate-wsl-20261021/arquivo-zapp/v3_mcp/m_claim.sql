DO $$
DECLARE
  _rep text := '';
  v record;
  _n bigint;
  _res text;
  _r text;
  _sub constant text := '00000000-0000-4000-8000-000000000001';
BEGIN
  SET LOCAL statement_timeout = '90s';

  -- base: zapp.evolution_messages COM claim sintetica (mesmo metodo da migration)
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims','{"sub":"'||_sub||'","role":"authenticated"}',true);
  PERFORM set_config('request.jwt.claim.sub',_sub,true);
  BEGIN
    EXECUTE 'SELECT count(*) FROM zapp.evolution_messages' INTO _n;
    _rep := _rep || 'N1b.zapp.evolution_messages as authenticated+claim = ' || _n || chr(10);
  EXCEPTION WHEN OTHERS THEN _rep := _rep || 'N1b.zapp.evolution_messages as authenticated+claim = ERR[' || SQLSTATE || '] ' || SQLERRM || chr(10); END;
  BEGIN
    EXECUTE 'SELECT count(*) FROM evo.evolution_messages' INTO _n;
    _rep := _rep || 'N2b.evo.evolution_messages as authenticated+claim = ' || _n || chr(10);
  EXCEPTION WHEN OTHERS THEN _rep := _rep || 'N2b.evo.evolution_messages as authenticated+claim = ERR[' || SQLSTATE || '] ' || SQLERRM || chr(10); END;
  BEGIN
    EXECUTE 'SELECT count(*) FROM evo.evolution_contacts' INTO _n;
    _rep := _rep || 'N4.evo.evolution_contacts as authenticated+claim = ' || _n || chr(10);
  EXCEPTION WHEN OTHERS THEN _rep := _rep || 'N4.evo.evolution_contacts as authenticated+claim = ERR[' || SQLSTATE || '] ' || SQLERRM || chr(10); END;
  RESET ROLE;
  _rep := _rep || chr(10);

  -- as 5 views de ops: authenticated+claim x service_role
  FOR v IN
    SELECT unnest(ARRAY['zapp_dash_daily','zapp_dash_heatmap','zapp_dash_overview','zapp_dash_top_contacts','zapp_inbox_threads']) AS relname
  LOOP
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims','{"sub":"'||_sub||'","role":"authenticated"}',true);
    PERFORM set_config('request.jwt.claim.sub',_sub,true);
    BEGIN
      EXECUTE format('SELECT count(*) FROM zapp.%I', v.relname) INTO _n;
      _res := _n::text;
    EXCEPTION WHEN OTHERS THEN _res := 'ERR[' || SQLSTATE || '] ' || SQLERRM; END;
    RESET ROLE;

    PERFORM set_config('role','service_role',true);
    BEGIN
      EXECUTE format('SELECT count(*) FROM zapp.%I', v.relname) INTO _n;
      _rep := _rep || 'R2.' || v.relname || ' authenticated+claim=' || _res || ' service_role=' || _n || chr(10);
    EXCEPTION WHEN OTHERS THEN
      _rep := _rep || 'R2.' || v.relname || ' authenticated+claim=' || _res || ' service_role=ERR' || chr(10);
    END;
    RESET ROLE;
  END LOOP;
  _rep := _rep || chr(10);

  -- anon com claim (nao deve mudar nada: sem grant)
  FOREACH _r IN ARRAY ARRAY['anon'] LOOP
    PERFORM set_config('role',_r,true);
    PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
    BEGIN
      EXECUTE 'SELECT count(*) FROM zapp.zapp_dash_overview' INTO _n;
      _rep := _rep || 'R3.zapp_dash_overview as anon+claim = ' || _n || chr(10);
    EXCEPTION WHEN OTHERS THEN
      _rep := _rep || 'R3.zapp_dash_overview as anon+claim = ERR[' || SQLSTATE || '] ' || SQLERRM || chr(10);
    END;
    RESET ROLE;
  END LOOP;

  -- policy de messages_select_scoped: expressao (para entender o criterio, sem dados)
  SELECT pg_get_expr(pol.polqual, pol.polrelid) INTO _res
    FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='evo' AND c.relname='evolution_messages' AND pol.polname='messages_select_scoped';
  _rep := _rep || 'POL.messages_select_scoped USING=' || coalesce(_res,'(NULL)') || chr(10);

  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
