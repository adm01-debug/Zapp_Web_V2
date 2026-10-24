DO $$
DECLARE
  _rep text := '';
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname || '.' || c.relname AS fq
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL unnest(c.reloptions) AS o(opt)
     WHERE c.relkind = 'v'
       AND n.nspname = ANY (ARRAY['public','zapp','evo','prospeccao'])
       AND o.opt = 'security_invoker=on'
     ORDER BY 1
  LOOP
    _rep := _rep || 'ON.' || r.fq || chr(10);
  END LOOP;
  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
