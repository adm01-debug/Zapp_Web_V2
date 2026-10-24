DO $$
DECLARE rep text := ''; n bigint; j jsonb; t text; lid text; out text;
BEGIN
  SELECT l.lid_jid INTO lid FROM public.evo_lid_phone_map l WHERE l.lid_jid IS NOT NULL AND l.phone_number IS NOT NULL LIMIT 1;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.rpc_list_eligible_agents(NULL)' INTO n;
    rep := rep || format('rpc_list_eligible_agents=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'rpc_list_eligible_agents=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.rpc_list_tasks(NULL,NULL,NULL,NULL,NULL,NULL,100,0)' INTO n;
    rep := rep || format('rpc_list_tasks=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'rpc_list_tasks=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.fn_match_keyword_automation(''teste'',10)' INTO n;
    rep := rep || format('fn_match_keyword_automation=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_match_keyword_automation=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.search_knowledge_base(''a'',5)' INTO n;
    rep := rep || format('search_knowledge_base=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'search_knowledge_base=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.fn_zapp_web_smoke_test_v2()' INTO n;
    rep := rep || format('fn_zapp_web_smoke_test_v2=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_zapp_web_smoke_test_v2=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.fn_get_pipeline_health_v2(NULL)' INTO n;
    rep := rep || format('rpc_get_pipeline_health_v2=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'rpc_get_pipeline_health_v2=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.get_compliance_metrics(now())' INTO n;
    rep := rep || format('get_compliance_metrics=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'get_compliance_metrics=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.fn_get_evolution_health_summary() x' INTO n;
    rep := rep || format('fn_get_evolution_health_summary_rows=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_get_evolution_health_summary=ERRO ' || SQLERRM || E'\n'; END;

  -- LID -> telefone via fn_normalize_send_jid (nao imprime o valor)
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT zapp.fn_normalize_send_jid($1, ''wpp2'')' INTO out USING lid;
    rep := rep || format('fn_normalize_send_jid_lid_resolvido=%s digitos_na_saida=%s',
          (out IS DISTINCT FROM lid), coalesce(length(regexp_replace(coalesce(out,''),'[^0-9]','','g')),0)) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_normalize_send_jid_lid=ERRO ' || SQLERRM || E'\n'; END;

  -- quem realmente tem grant: anon tambem?
  rep := rep || format('anon_exec_export=%s authenticated_exec_export=%s service_exec_export=%s',
        has_function_privilege('anon','zapp.fn_export_messages(text,text,timestamptz,timestamptz)','EXECUTE'),
        has_function_privilege('authenticated','zapp.fn_export_messages(text,text,timestamptz,timestamptz)','EXECUTE'),
        has_function_privilege('service_role','zapp.fn_export_messages(text,text,timestamptz,timestamptz)','EXECUTE')) || E'\n';

  RESET ROLE;
  RAISE EXCEPTION E'REPORT\n%', rep;
END $$;
