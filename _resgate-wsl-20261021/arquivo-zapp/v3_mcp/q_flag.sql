DO $$
DECLARE
  _rep text := '';
  r record;
  _n_a int; _n_b int; _n_c int;
  _ln text;
BEGIN
  -- (1) quais VALORES a opcao security_invoker assume no catalogo
  FOR r IN
    SELECT n.nspname, o.opt AS valor, count(*) AS n
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL unnest(c.reloptions) AS o(opt)
     WHERE c.relkind = 'v'
       AND n.nspname = ANY (ARRAY['public','zapp','evo','prospeccao'])
       AND o.opt LIKE 'security_invoker=%'
     GROUP BY 1,2 ORDER BY 1,2
  LOOP
    _rep := _rep || 'OPT.' || r.nspname || ' valor=[' || r.valor || '] views=' || r.n || chr(10);
  END LOOP;
  _rep := _rep || chr(10);

  -- (2) zapp: predicado ERRADO (LIKE '=true') x predicado CORRETO (opcao presente)
  SELECT count(*) INTO _n_a FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind='v' AND n.nspname='zapp'
     AND coalesce(array_to_string(c.reloptions,','),'') LIKE '%security_invoker=true%';
  SELECT count(*) INTO _n_b FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind='v' AND n.nspname='zapp'
     AND EXISTS (SELECT 1 FROM unnest(coalesce(c.reloptions,ARRAY[]::text[])) o WHERE o LIKE 'security_invoker=%');
  SELECT count(*) INTO _n_c FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind='v' AND n.nspname='zapp'
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(c.reloptions,ARRAY[]::text[])) o WHERE o LIKE 'security_invoker=%');
  _rep := _rep || 'ZAPP.total_views=' || (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='v' AND n.nspname='zapp') || chr(10);
  _rep := _rep || 'ZAPP.predicado_LIKE_true=' || _n_a || chr(10);
  _rep := _rep || 'ZAPP.predicado_opcao_presente=' || _n_b || chr(10);
  _rep := _rep || 'ZAPP.SEM_opcao_de_verdade=' || _n_c || chr(10) || chr(10);

  -- (3) escopo do INV-9 (4 schemas): quantos SEM a opcao de verdade
  FOR r IN
    SELECT n.nspname,
           count(*) AS total,
           count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM unnest(coalesce(c.reloptions,ARRAY[]::text[])) o WHERE o LIKE 'security_invoker=%')) AS sem_opcao,
           count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM unnest(coalesce(c.reloptions,ARRAY[]::text[])) o WHERE o LIKE 'security_invoker=%')
                                AND coalesce(array_to_string(c.reloptions,','),'') NOT LIKE '%security_invoker=true%') AS sem_opcao_e_predicado_acha
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relkind='v' AND n.nspname = ANY(ARRAY['public','zapp','evo','prospeccao'])
     GROUP BY 1 ORDER BY 1
  LOOP
    _rep := _rep || 'ESC.' || r.nspname || ' total=' || r.total || ' sem_opcao_real=' || r.sem_opcao
         || ' falsos_positivos_do_predicado=' || r.sem_opcao_e_predicado_acha || chr(10);
  END LOOP;
  _rep := _rep || chr(10);

  -- (4) a view do baseline: flag real + legibilidade
  SELECT coalesce(array_to_string(c.reloptions,','),'(nenhuma)') INTO _ln
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='zapp' AND c.relname='evolution_instances_public';
  _rep := _rep || 'BASELINE.evolution_instances_public.reloptions=' || _ln || chr(10);

  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
