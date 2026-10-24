DO $$
DECLARE rep text := ''; n bigint; s text; r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, c.relname AS rel
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname IN ('sicoob_reply_outbox','evolution_conversations','evolution_tasks','message_reactions','evolution_reactions','password_reset_requests','login_attempts')
    ORDER BY 1,2
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I.%I', r.sch, r.rel) INTO n;
      rep := rep || format('rel %s.%s=%s', r.sch, r.rel, n) || E'\n';
    EXCEPTION WHEN OTHERS THEN rep := rep || format('rel %s.%s=ERRO %s', r.sch, r.rel, SQLERRM) || E'\n'; END;
  END LOOP;

  BEGIN
    EXECUTE 'SELECT string_agg(column_name, '','' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema=''evo'' AND table_name=''evolution_conversations''' INTO s;
    rep := rep || 'cols evo.evolution_conversations=' || coalesce(s,'-') || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'cols conversas=ERRO ' || SQLERRM || E'\n'; END;

  BEGIN
    EXECUTE 'SELECT string_agg(column_name, '','' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema=''zapp'' AND table_name=''evolution_tasks''' INTO s;
    rep := rep || 'cols zapp.evolution_tasks=' || coalesce(s,'-') || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'cols tasks=ERRO ' || SQLERRM || E'\n'; END;

  -- medicao como authenticated do batch de reacoes (com id uuid real, sem imprimir valor)
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM zapp.rpc_get_reactions_batch((SELECT array_agg(mr.message_id) FROM zapp.message_reactions mr)) x' INTO n;
    rep := rep || format('rpc_get_reactions_batch_linhas=%s', n) || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'rpc_get_reactions_batch=ERRO ' || SQLERRM || E'\n'; END;
  RESET ROLE;

  BEGIN
    EXECUTE 'SELECT string_agg(column_name, '','' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema=''zapp'' AND table_name=''evolution_message_queue''' INTO s;
    rep := rep || 'cols zapp.evolution_message_queue=' || coalesce(s,'-') || E'\n';
  EXCEPTION WHEN OTHERS THEN rep := rep || 'cols queue=ERRO ' || SQLERRM || E'\n'; END;

  RAISE EXCEPTION E'REPORT\n%', rep;
END $$;
