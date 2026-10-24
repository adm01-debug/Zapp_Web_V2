DO $do$
DECLARE v text;
BEGIN
  SELECT substr(regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g'), 330, 900) INTO v
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='zapp' AND p.proname='fn_cookie_health';
  RAISE EXCEPTION 'CK %', v;
END $do$;
