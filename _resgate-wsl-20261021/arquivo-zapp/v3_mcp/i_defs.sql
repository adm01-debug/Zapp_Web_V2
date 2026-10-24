DO $$
DECLARE
  _rep text := '';
  v record;
  _def text;
  _n bigint;
  _res text;
  r record;
BEGIN
  SET LOCAL statement_timeout = '90s';

  -- definicao viva: FONTE de cada uma das 5 views de ops
  FOR v IN
    SELECT unnest(ARRAY['zapp_dash_daily','zapp_dash_heatmap','zapp_dash_overview','zapp_dash_top_contacts','zapp_inbox_threads']) AS relname
  LOOP
    SELECT pg_get_viewdef(('zapp.'||v.relname)::regclass, true) INTO _def;
    _rep := _rep || 'V.' || v.relname
         || ' le_evo_active_messages=' || (position('active_messages' in _def) > 0)::text
         || ' le_zapp_evolution_messages=' || (position('zapp.evolution_messages' in _def) > 0)::text
         || ' le_evo_evolution_contacts=' || (position('evolution_contacts' in _def) > 0)::text
         || ' len_def=' || length(_def) || chr(10);
  END LOOP;

  -- dependencias reais registradas em pg_depend (view -> relacao)
  FOR r IN
    SELECT src.relname AS view_name, dep_n.nspname || '.' || dep.relname AS dep_name, dep.relkind::text AS kind
      FROM pg_depend d
      JOIN pg_rewrite rw ON rw.oid = d.objid
      JOIN pg_class src ON src.oid = rw.ev_class
      JOIN pg_namespace sn ON sn.oid = src.relnamespace
      JOIN pg_class dep ON dep.oid = d.refobjid
      JOIN pg_namespace dep_n ON dep_n.oid = dep.relnamespace
     WHERE d.refclassid = 'pg_class'::regclass
       AND sn.nspname='zapp'
       AND src.relname IN ('zapp_dash_daily','zapp_dash_heatmap','zapp_dash_overview','zapp_dash_top_contacts','zapp_inbox_threads')
       AND dep.oid <> src.oid
     ORDER BY 1,2
  LOOP
    _rep := _rep || 'V.dep ' || r.view_name || ' -> ' || r.dep_name || ' (' || r.kind || ')' || chr(10);
  END LOOP;
  _rep := _rep || chr(10);

  -- v_cookie_health le a funcao?
  SELECT pg_get_viewdef('zapp.v_cookie_health'::regclass, true) INTO _def;
  _rep := _rep || 'V.v_cookie_health def=' || _def || chr(10);
  FOR r IN
    SELECT dep_n.nspname || '.' || dep.proname AS dep_name
      FROM pg_depend d
      JOIN pg_rewrite rw ON rw.oid = d.objid
      JOIN pg_class src ON src.oid = rw.ev_class
      JOIN pg_namespace sn ON sn.oid = src.relnamespace
      JOIN pg_proc dep ON dep.oid = d.refobjid
      JOIN pg_namespace dep_n ON dep_n.oid = dep.pronamespace
     WHERE d.refclassid = 'pg_proc'::regclass AND sn.nspname='zapp' AND src.relname='v_cookie_health'
  LOOP
    _rep := _rep || 'V.v_cookie_health -> funcao ' || r.dep_name || chr(10);
  END LOOP;
  _rep := _rep || chr(10);

  -- ============ DIVIDA: views COM a flag que NAO sao legiveis por authenticated ============
  DECLARE
    _falha int := 0; _ok int := 0; _lista text := '';
  BEGIN
    FOR v IN
      SELECT c.relname
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE c.relkind='v' AND n.nspname='zapp'
         AND coalesce(array_to_string(c.reloptions,','),'') LIKE '%security_invoker=true%'
       ORDER BY c.relname
    LOOP
      BEGIN
        PERFORM set_config('role','authenticated',true);
        EXECUTE format('SELECT count(*) FROM zapp.%I', v.relname) INTO _n;
        _ok := _ok + 1;
      EXCEPTION WHEN OTHERS THEN
        _falha := _falha + 1;
        _lista := _lista || v.relname || '|';
      END;
      RESET ROLE;
    END LOOP;
    _rep := _rep || 'X.views_zapp_com_flag_legiveis_authenticated=' || _ok || chr(10);
    _rep := _rep || 'X.views_zapp_com_flag_NAO_legiveis_authenticated=' || _falha || chr(10);
    _rep := _rep || 'X.lista_nao_legiveis=' || _lista || chr(10);
  END;

  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
