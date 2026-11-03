CREATE OR REPLACE VIEW public.searchbox_usage_daily
WITH (security_invoker = true)
AS
SELECT
  (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
  count(*) FILTER (WHERE a.action = 'searchbox_session')::integer AS sessoes,
  count(*) FILTER (WHERE a.action = 'searchbox_cost_guard')::integer AS degradacoes,
  max(a.created_at) AS ultimo_evento_em
FROM public.audit_logs a
WHERE a.action IN ('searchbox_session', 'searchbox_cost_guard')
GROUP BY 1
ORDER BY 1 DESC

COMMENT ON VIEW public.searchbox_usage_daily IS
  'E52: consumo diario do Searchbox (sessoes) e avisos de teto (degradacoes), no fuso America/Sao_Paulo. Fonte: audit_logs, a mesma da RPC count_searchbox_sessions_this_month.'

REVOKE ALL ON public.searchbox_usage_daily FROM PUBLIC, anon

GRANT SELECT ON public.searchbox_usage_daily TO authenticated
