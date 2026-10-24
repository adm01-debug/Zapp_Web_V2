DO $$
DECLARE
  _rep text := '';
  v record;
  _pol text;
BEGIN
  FOR v IN
    SELECT n.nspname||'.'||c.relname AS fullname, c.relkind::text AS kind,
           c.relrowsecurity::text AS rls, c.relforcerowsecurity::text AS rlsf,
           c.relispartition::text AS ispart,
           coalesce(pg_get_userbyid(c.relowner),'?') AS owner
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE (n.nspname='zapp' AND c.relname IN ('evolution_messages','evolution_contacts'))
        OR (n.nspname='evo'  AND c.relname IN ('evolution_messages','active_messages','evolution_contacts'))
     ORDER BY 1
  LOOP
    SELECT coalesce(string_agg(pol.polname || '[' || pol.polcmd::text || ':' || coalesce(array_to_string(pol.polroles::regrole[]::text[],'+'),'all') || ']', ' '),'(NENHUMA)')
      INTO _pol
      FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=split_part(v.fullname,'.',1) AND c.relname=split_part(v.fullname,'.',2);
    _rep := _rep || 'REL.' || v.fullname || ' kind=' || v.kind || ' rls=' || v.rls || ' forced=' || v.rlsf
         || ' ispart=' || v.ispart || ' owner=' || v.owner || ' policies=' || _pol || chr(10);
  END LOOP;
  _rep := _rep || chr(10);

  -- definicao de zapp.evolution_messages (e passthrough?)
  DECLARE _d text;
  BEGIN
    SELECT pg_get_viewdef('zapp.evolution_messages'::regclass, true) INTO _d;
    _rep := _rep || 'DEF.zapp.evolution_messages_len=' || length(_d) || chr(10);
    _rep := _rep || 'DEF.zapp.evolution_messages_le_evo_evolution_messages=' || (position('evo.evolution_messages' in _d)>0)::text || chr(10);
    _rep := _rep || 'DEF.zapp.evolution_messages_tem_filtro_where=' || (position('WHERE' in upper(_d))>0)::text || chr(10);
    _rep := _rep || 'DEF.zapp.evolution_messages=' || replace(_d, chr(10), ' ') || chr(10) || chr(10);
  EXCEPTION WHEN OTHERS THEN
    _rep := _rep || 'DEF.zapp.evolution_messages_nao_e_view: ' || SQLERRM || chr(10);
  END;

  -- quem le o que: contagem por papel em cada elo
  DECLARE
    _r text; _n bigint;
  BEGIN
    FOREACH _r IN ARRAY ARRAY['postgres','authenticated','anon','service_role','metabase_reader','dyad_reader','om_reader'] LOOP
      BEGIN
        PERFORM set_config('role',_r,true);
        EXECUTE 'SELECT count(*) FROM zapp.evolution_messages' INTO _n;
        _rep := _rep || 'N1.zapp.evolution_messages as ' || _r || ' = ' || _n || chr(10);
      EXCEPTION WHEN OTHERS THEN
        _rep := _rep || 'N1.zapp.evolution_messages as ' || _r || ' = ERR[' || SQLSTATE || ']' || chr(10);
      END;
      RESET ROLE;
    END LOOP;
    FOREACH _r IN ARRAY ARRAY['postgres','authenticated','service_role'] LOOP
      BEGIN
        PERFORM set_config('role',_r,true);
        EXECUTE 'SELECT count(*) FROM evo.evolution_messages' INTO _n;
        _rep := _rep || 'N2.evo.evolution_messages as ' || _r || ' = ' || _n || chr(10);
      EXCEPTION WHEN OTHERS THEN
        _rep := _rep || 'N2.evo.evolution_messages as ' || _r || ' = ERR[' || SQLSTATE || ']' || chr(10);
      END;
      RESET ROLE;
    END LOOP;
    FOREACH _r IN ARRAY ARRAY['postgres','authenticated','service_role'] LOOP
      BEGIN
        PERFORM set_config('role',_r,true);
        EXECUTE 'SELECT count(*) FROM evo.active_messages' INTO _n;
        _rep := _rep || 'N3.evo.active_messages as ' || _r || ' = ' || _n || chr(10);
      EXCEPTION WHEN OTHERS THEN
        _rep := _rep || 'N3.evo.active_messages as ' || _r || ' = ERR[' || SQLSTATE || '] ' || SQLERRM || chr(10);
      END;
      RESET ROLE;
    END LOOP;
  END;

  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
