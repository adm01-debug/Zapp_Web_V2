-- E37 (Fase 5, Search Box): guarda de custo mensal do Mapbox Search Box.
-- audit_logs e SELECT admin-only (RLS) e o cliente nao pode ler direto -- esta
-- RPC expoe so a CONTAGEM de sessoes abertas no mes corrente (evento
-- 'searchbox_session', gravado em mapboxSession.ts/E35), nunca as linhas.
-- Callable por qualquer authenticated: e o proprio picker que decide, no
-- client, se o teto de 500 sessoes gratis/mes da Mapbox foi passado
-- (src/lib/mapboxCostGuard.ts).
CREATE OR REPLACE FUNCTION public.count_searchbox_sessions_this_month()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::integer
  FROM public.audit_logs
  WHERE action = 'searchbox_session'
    AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
$function$;

REVOKE ALL ON FUNCTION public.count_searchbox_sessions_this_month() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_searchbox_sessions_this_month() TO authenticated;
