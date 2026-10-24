DO $$
DECLARE
  _rep text := '';
  r record;
  _n int;
BEGIN
  -- schema prospeccao existe?
  SELECT count(*) INTO _n FROM pg_namespace WHERE nspname IN ('public','zapp','evo','prospeccao');
  _rep := _rep || 'I9.schemas_do_escopo_existentes=' || _n || ' de 4' || chr(10);
  SELECT count(*) INTO _n FROM pg_namespace WHERE nspname='prospeccao';
  _rep := _rep || 'I9.prospeccao_existe=' || _n || chr(10);

  -- total de views no escopo
  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind='v' AND n.nspname = ANY(ARRAY['public','zapp','evo','prospeccao']);
  _rep := _rep || 'I9.views_no_escopo=' || _n || chr(10);

  -- views SEM a flag, por schema (todas, nao so zapp)
  FOR r IN
    SELECT n.nspname, count(*) AS sem
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relkind='v' AND n.nspname = ANY(ARRAY['public','zapp','evo','prospeccao'])
       AND coalesce(array_to_string(c.reloptions,','),'') NOT LIKE '%security_invoker=true%'
     GROUP BY n.nspname ORDER BY n.nspname
  LOOP
    _rep := _rep || 'I9.sem_flag.' || r.nspname || '=' || r.sem || chr(10);
  END LOOP;

  -- lista nominal das sem flag fora de zapp
  SELECT coalesce(string_agg(n.nspname||'.'||c.relname, ', ' ORDER BY 1),'(nenhuma)')
    INTO _rep
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind='v' AND n.nspname IN ('public','evo')
     AND coalesce(array_to_string(c.reloptions,','),'') NOT LIKE '%security_invoker=true%';
  _rep := 'IGNORAR' || chr(10) || 'I9.sem_flag_fora_de_zapp=' || _rep || chr(10);

  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
