DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS assinatura,
           (p.prorettype = 'trigger'::regtype) AS e_trigger
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'ai_is_canonical_priority', 'ai_is_canonical_sentiment', 'ai_text_array',
         'persist_conversation_analysis', 'replace_ai_conversation_tags'
       )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.assinatura);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.assinatura);
    IF NOT r.e_trigger THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.assinatura);
    END IF;
  END LOOP;
END $$
