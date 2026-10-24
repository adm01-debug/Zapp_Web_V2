DO $$
DECLARE
  _rep text := '';
  v record;
  _na bigint; _ns bigint; _np bigint;
  _res text;
  _rls text; _pol text;
BEGIN
  SET LOCAL statement_timeout = '90s';

  -- zapp.evolution_messages: RLS e contagem por papel
  SELECT c.relrowsecurity::text, c.relforcerowsecurity::text INTO _rls, _pol
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='zapp' AND c.relname='evolution_messages';
  _rep := _rep || 'RLS.zapp.evolution_messages enabled=' || _rls || ' forced=' || _pol || chr(10);
  SELECT count(*) INTO _np FROM zapp.evolution_messages;
  PERFORM set_config('role','authenticated',true);
  SELECT count(*) INTO _na FROM zapp.evolution_messages;
  RESET ROLE;
  PERFORM set_config('role','service_role',true);
  SELECT count(*) INTO _ns FROM zapp.evolution_messages;
  RESET ROLE;
  _rep := _rep || 'CNT.zapp.evolution_messages postgres=' || _np || ' authenticated=' || _na || ' service_role=' || _ns || chr(10);

  SELECT coalesce(string_agg(pol.polname || ':' || pol.polcmd::text || ':' || coalesce(array_to_string(pol.polroles::regrole[]::text[],'+'),'all'), ' | '),'(SEM POLICY)')
    INTO _pol
    FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='zapp' AND c.relname='evolution_messages';
  _rep := _rep || 'RLS.zapp.evolution_messages policies=' || _pol || chr(10) || chr(10);

  -- zapp.evolution_messages x evo.evolution_messages x evo.active_messages (contagens)
  FOR v IN
    SELECT c.oid, n.nspname||'.'||c.relname AS fullname
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE (n.nspname='zapp' AND c.relname='evolution_messages')
        OR (n.nspname='evo' AND c.relname IN ('evolution_messages','active_messages'))
     ORDER BY 2
  LOOP
    EXECUTE format('SELECT count(*) FROM %s', v.fullname) INTO _np;
    _rep := _rep || 'CNT.' || v.fullname || ' rows=' || _np || chr(10);
  END LOOP;

  -- colunas de evo.active_messages x zapp.evolution_messages
  SELECT count(*) INTO _na FROM pg_attribute a
    JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='evo' AND c.relname='active_messages' AND a.attnum>0 AND NOT a.attisdropped;
  SELECT count(*) INTO _ns FROM pg_attribute a
    JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='zapp' AND c.relname='evolution_messages' AND a.attnum>0 AND NOT a.attisdropped;
  _rep := _rep || 'COLS.evo.active_messages=' || _na || ' zapp.evolution_messages=' || _ns || chr(10);

  -- assinatura de colunas identica?
  SELECT count(*) INTO _np FROM (
    SELECT a.attname, format_type(a.atttypid,a.atttypmod) AS ty, a.attnum
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='evo' AND c.relname='active_messages' AND a.attnum>0 AND NOT a.attisdropped
    EXCEPT
    SELECT a.attname, format_type(a.atttypid,a.atttypmod), a.attnum
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='zapp' AND c.relname='evolution_messages' AND a.attnum>0 AND NOT a.attisdropped
  ) x;
  _rep := _rep || 'COLS.diferenca_evo_active_vs_zapp_evolution_messages=' || _np || chr(10);

  SELECT pg_get_viewdef('evo.active_messages'::regclass, true) INTO _res;
  _rep := _rep || 'DEF.evo.active_messages=' || replace(_res, chr(10), ' ') || chr(10);
  _rep := _rep || 'DEF.evo.active_messages_len=' || length(_res) || chr(10) || chr(10);

  -- as 5 views de ops: contagem como service_role (se >0 e authenticated=0 -> tela vazia)
  FOR v IN
    SELECT unnest(ARRAY['zapp_dash_daily','zapp_dash_heatmap','zapp_dash_overview','zapp_dash_top_contacts','zapp_inbox_threads']) AS relname
  LOOP
    PERFORM set_config('role','service_role',true);
    BEGIN
      EXECUTE format('SELECT count(*) FROM zapp.%I', v.relname) INTO _ns;
      _res := _ns::text;
    EXCEPTION WHEN OTHERS THEN _res := 'ERR:' || SQLERRM; END;
    RESET ROLE;
    BEGIN
      PERFORM set_config('role','authenticated',true);
      EXECUTE format('SELECT count(*) FROM zapp.%I', v.relname) INTO _na;
    EXCEPTION WHEN OTHERS THEN _na := -1; END;
    RESET ROLE;
    _rep := _rep || 'ROWS.' || v.relname || ' service_role=' || _res || ' authenticated=' || _na || chr(10);
  END LOOP;

  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
