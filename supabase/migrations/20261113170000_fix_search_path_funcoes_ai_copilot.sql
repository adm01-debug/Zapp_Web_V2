-- 20261113170000_fix_search_path_funcoes_ai_copilot
--
-- PRECISA DE APROVAÇÃO DO DONO ANTES DE APLICAR EM PRODUÇÃO (DDL em produção).
--
-- Sintoma (advisor de segurança do Supabase, 13/11/2026): 6 lints WARN
-- `function_search_path_mutable` — as únicas funções de `public` sem
-- `search_path` fixo (`pg_proc.proconfig IS NULL`):
--   ai_is_canonical_churn_risk(text), ai_is_canonical_priority(text),
--   ai_is_canonical_sentiment(text), ai_is_canonical_urgency(text),
--   ai_text_array(jsonb), copilot_sessions_updated_at().
-- Todas são `SECURITY INVOKER` (prosecdef=false) e executáveis por
-- `authenticated`; o risco é o clássico "search_path do chamador" em funções
-- usadas por CHECK/trigger. Provado em produção (13/11, MCP read-only):
--   SELECT oid::regprocedure, prosecdef, proconfig FROM pg_proc
--   WHERE proname IN (...) → 6 linhas, proconfig = NULL em todas.
--
-- Por que `search_path = ''` é seguro aqui (corpo lido com pg_get_functiondef):
--   * as 4 `ai_is_canonical_*`: `select p_value is null or p_value in (...)` —
--     só literais; nenhum objeto de schema.
--   * `ai_text_array`: `coalesce`, `array_agg`, `jsonb_array_elements_text`,
--     `jsonb_typeof` — todas em `pg_catalog`, que o Postgres consulta sempre,
--     mesmo com search_path vazio.
--   * `copilot_sessions_updated_at`: `NEW.updated_at = now()` — só `pg_catalog`.
-- Efeito colateral conhecido: função SQL com cláusula SET deixa de ser
-- "inlinável" pelo planner. São comparações de literal em CHECK/trigger de
-- tabelas pequenas (copilot_*, conversation_analyses) — custo desprezível.
--
-- Idempotente: ALTER FUNCTION ... SET sobrescreve o mesmo valor; o bloco DO
-- pula funções ausentes (replay do zero em Postgres descartável).
--
-- Reversão:
--   ALTER FUNCTION public.ai_is_canonical_churn_risk(text) RESET search_path;
--   ALTER FUNCTION public.ai_is_canonical_priority(text) RESET search_path;
--   ALTER FUNCTION public.ai_is_canonical_sentiment(text) RESET search_path;
--   ALTER FUNCTION public.ai_is_canonical_urgency(text) RESET search_path;
--   ALTER FUNCTION public.ai_text_array(jsonb) RESET search_path;
--   ALTER FUNCTION public.copilot_sessions_updated_at() RESET search_path;

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
$$;
