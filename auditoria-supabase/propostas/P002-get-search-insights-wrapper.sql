-- PROPOSTA P002 — NÃO APLICADA — Auditoria 2026-10-22
-- Objeto: public.get_search_insights (wrapper)
-- Problema: src/hooks/admin/useSearchInsights.ts:89 chama .rpc('get_search_insights', { p_days: days })
--   mas o banco possui apenas 'search_insights'. A divergência de nome causa PGRST202 em toda chamada.
--
--   Evidência:
--     SELECT proname FROM pg_proc WHERE proname IN ('get_search_insights','search_insights');
--     → apenas search_insights existe
--
-- Impacto se não corrigido: Tela SearchInsightsView nunca carrega dados — PGRST202 em toda chamada.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.get_search_insights(integer);
--
-- ALTERNATIVAS:
--   (A) Criar o wrapper abaixo (esta proposta) — sem alterar o código frontend.
--   (B) Corrigir o código frontend: .rpc('search_insights', { p_days: days })
--       Verificar assinatura exata de search_insights antes de escolher B.
--
-- ATENÇÃO: Verificar a assinatura exata de search_insights antes de aplicar:
--   SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE proname='search_insights';

-- Opção A: criar wrapper que delega para search_insights
-- (ajustar tipo de retorno e parâmetros conforme assinatura real)
CREATE OR REPLACE FUNCTION public.get_search_insights(p_days integer DEFAULT 30)
RETURNS TABLE (
  -- Ajustar colunas conforme o retorno real de search_insights
  -- Obter com: SELECT attname, atttypid::regtype FROM pg_attribute
  --            WHERE attrelid='public.search_insights'::regclass AND attnum > 0
  query_text text,
  search_count bigint,
  avg_results numeric,
  last_searched_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.search_insights(p_days := p_days);
END;
$$;
