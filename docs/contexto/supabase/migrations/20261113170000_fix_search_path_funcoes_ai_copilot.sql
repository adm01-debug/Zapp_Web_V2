DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.ai_is_canonical_churn_risk(text)',
    'public.ai_is_canonical_priority(text)',
    'public.ai_is_canonical_sentiment(text)',
    'public.ai_is_canonical_urgency(text)',
    'public.ai_text_array(jsonb)',
    'public.copilot_sessions_updated_at()'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE NOTICE 'search_path: função % ausente, pulando', v_fn;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET search_path = ''''', v_fn);
  END LOOP;
END
$$
