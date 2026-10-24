DO $$
DECLARE
  _total int;
  _com   int;
  _sem   int;
  _lista text;
  _rep   text := '';
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE coalesce(array_to_string(c.reloptions, ','), '') LIKE '%security_invoker=true%'),
         count(*) FILTER (WHERE coalesce(array_to_string(c.reloptions, ','), '') NOT LIKE '%security_invoker=true%')
    INTO _total, _com, _sem
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'v' AND n.nspname = 'zapp';

  SELECT coalesce(string_agg(c.relname, ',' ORDER BY c.relname), '(nenhuma)')
    INTO _lista
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'v' AND n.nspname = 'zapp'
     AND coalesce(array_to_string(c.reloptions, ','), '') NOT LIKE '%security_invoker=true%';

  _rep := _rep || 'A.zapp_views_total=' || _total || chr(10);
  _rep := _rep || 'A.zapp_views_com_flag=' || _com || chr(10);
  _rep := _rep || 'A.zapp_views_sem_flag=' || _sem || chr(10);
  _rep := _rep || 'A.sem_flag_lista=' || _lista || chr(10);

  -- mesma contagem para os outros schemas do escopo do INV-9 (contexto)
  DECLARE
    r record;
  BEGIN
    FOR r IN
      SELECT n.nspname,
             count(*) AS total,
             count(*) FILTER (WHERE coalesce(array_to_string(c.reloptions, ','), '') LIKE '%security_invoker=true%') AS com
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind = 'v' AND n.nspname IN ('public','zapp','evo','prospeccao')
       GROUP BY n.nspname ORDER BY n.nspname
    LOOP
      _rep := _rep || 'A.schema.' || r.nspname || '=total:' || r.total || ' com_flag:' || r.com || ' sem_flag:' || (r.total - r.com) || chr(10);
    END LOOP;
  END;

  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
