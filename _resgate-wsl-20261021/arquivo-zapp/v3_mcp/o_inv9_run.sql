-- Replica VERBATIM o corpo de scripts/sql/check-view-security-invoker.sql,
-- com o mesmo valor de baseline que o workflow passa:
--   BASELINE="$(grep -v '^#' baseline | grep -v '^[[:space:]]*$' | tr '\n' ',' | sed 's/,$//')"
-- -> 'evolution_instances_public'
DO $$
DECLARE
  _schemas  constant text[] := ARRAY['public','zapp','evo','prospeccao'];
  _baseline text[] := string_to_array('evolution_instances_public', ',');
  _existem  integer;
  _total    integer;
  _novas    text;
  _rep      text := '';
  r record;
BEGIN
  SELECT count(*) INTO _existem FROM pg_namespace WHERE nspname = ANY (_schemas);
  _rep := _rep || 'INV9.schemas_existem=' || _existem || ' de ' || array_length(_schemas,1) || chr(10);
  IF _existem <> array_length(_schemas, 1) THEN
    _rep := _rep || 'INV9.RESULTADO=EXCEPTION guarda de escopo' || chr(10);
    RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
  END IF;

  SELECT count(*) INTO _total
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'v' AND n.nspname = ANY (_schemas);
  _rep := _rep || 'INV9.views_no_escopo=' || _total || chr(10);

  IF _total = 0 THEN
    _rep := _rep || 'INV9.RESULTADO=EXCEPTION guarda de vacuidade' || chr(10);
    RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
  END IF;

  _rep := _rep || 'INV9.baseline_recebida=' || coalesce(array_to_string(_baseline,','),'(NULL)') || chr(10);
  _rep := _rep || 'INV9.baseline_tamanho=' || coalesce(array_length(_baseline,1),0) || chr(10);

  SELECT string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY 1)
    INTO _novas
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'v'
     AND n.nspname = ANY (_schemas)
     AND coalesce(array_to_string(c.reloptions, ','), '') NOT LIKE '%security_invoker=true%'
     AND (n.nspname || '.' || c.relname) <> ALL (_baseline);

  IF _novas IS NOT NULL THEN
    SELECT count(*) INTO _total
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relkind='v' AND n.nspname = ANY(_schemas)
       AND coalesce(array_to_string(c.reloptions,','),'') NOT LIKE '%security_invoker=true%';
    _rep := _rep || 'INV9.views_sem_flag_total=' || _total || chr(10);
    _rep := _rep || 'INV9.excused_pelo_baseline=0 (nenhum nome casa)' || chr(10);
    _rep := _rep || 'INV9.RESULTADO=FAIL — ' || _novas || chr(10);
  ELSE
    _rep := _rep || 'INV9.RESULTADO=PASS' || chr(10);
  END IF;

  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
