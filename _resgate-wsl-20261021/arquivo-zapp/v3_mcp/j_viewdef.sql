DO $$
DECLARE
  v record;
  _rep text := '';
  _def text;
BEGIN
  FOR v IN
    SELECT unnest(ARRAY['zapp_dash_daily','zapp_dash_heatmap','zapp_dash_overview','zapp_dash_top_contacts','zapp_inbox_threads']) AS relname
  LOOP
    SELECT pg_get_viewdef(('zapp.'||v.relname)::regclass, true) INTO _def;
    _rep := _rep || '===' || v.relname || '===' || chr(10) || _def || chr(10);
  END LOOP;
  RAISE EXCEPTION 'REPORT%', chr(10) || _rep;
END $$;
