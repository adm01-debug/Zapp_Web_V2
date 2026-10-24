DO $$
DECLARE
  _rep text := '';
  _acl text; _flag text; _rls text;
  _r text; _n bigint; _res text;
BEGIN
  SELECT coalesce(array_to_string(c.reloptions,','),'(nenhuma)'), coalesce(c.relacl::text,'(NULL)'),
         c.relrowsecurity::text
    INTO _flag,_acl,_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='zapp' AND c.relname='evolution_instances_public';
  _rep := _rep || 'Z.evolution_instances_public flag=[' || _flag || '] rls=' || _rls || chr(10);
  _rep := _rep || 'Z.evolution_instances_public acl=' || _acl || chr(10);

  FOREACH _r IN ARRAY ARRAY['postgres','authenticated','anon','service_role','metabase_reader','dyad_reader','om_reader','public'] LOOP
    _rep := _rep || 'Z.SELECT.' || _r || '=' || has_table_privilege(_r,'zapp.evolution_instances_public','SELECT')::text || chr(10);
  END LOOP;

  FOREACH _r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    BEGIN
      PERFORM set_config('role',_r,true);
      EXECUTE 'SELECT count(*) FROM zapp.evolution_instances_public' INTO _n;
      _res := 'OK rows=' || _n;
    EXCEPTION WHEN OTHERS THEN _res := 'ERR[' || SQLSTATE || '] ' || SQLERRM; END;
    RESET ROLE;
    _rep := _rep || 'Z.read_as_' || _r || '=' || _res || chr(10);
  END LOOP;

  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
