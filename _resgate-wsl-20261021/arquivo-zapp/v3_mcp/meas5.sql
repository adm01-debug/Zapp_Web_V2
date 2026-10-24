DO $$
DECLARE rep text := ''; n bigint; s text; j jsonb;
BEGIN
  SELECT string_agg(column_name||':'||data_type, ',' ORDER BY ordinal_position) INTO s
    FROM information_schema.columns WHERE table_schema='zapp' AND table_name='integration_profiles';
  rep := rep || 'cols zapp.integration_profiles=' || coalesce(s,'-') || E'\n';

  SELECT count(*) INTO n FROM zapp.integration_profiles;
  rep := rep || format('rows integration_profiles=%s', n) || E'\n';
  SELECT count(*) INTO n FROM zapp.integration_profiles WHERE is_active = true;
  rep := rep || format('rows active=%s', n) || E'\n';

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.rpc_get_active_integration_profile() x' INTO n;
    rep := rep || format('rpc_get_active_integration_profile_linhas=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'rpc_get_active_integration_profile=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.fn_get_conversation_history((SELECT remote_jid FROM zapp.evolution_messages WHERE instance_name=''wpp2'' GROUP BY 1 ORDER BY count(*) DESC LIMIT 1),''wpp2'',1000000)' INTO n;
    rep := rep || format('fn_get_conversation_history_limit_1M=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_get_conversation_history_1M=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.get_contact_conversations((SELECT contact_id FROM zapp.evolution_conversations WHERE contact_id IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1),1000000)' INTO n;
    rep := rep || format('get_contact_conversations_limit_1M=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'get_contact_conversations_1M=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT zapp.fn_get_deleted_messages(''wpp2'',NULL,1000000)' INTO j;
    rep := rep || format('fn_get_deleted_messages_total_limit_1M=%s', j->>'total') || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_get_deleted_messages_1M=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT zapp.fn_list_shared_links(NULL,NULL,NULL,1000000)' INTO j;
    rep := rep || format('fn_list_shared_links_total_limit_1M=%s', j->>'total') || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'fn_list_shared_links_1M=ERRO ' || SQLERRM || E'\n'; END;

  RESET ROLE;
  RAISE EXCEPTION E'REPORT\n%', rep;
END $$;
