-- dashboard_sentiment_alerts(timestamp with time zone) -- RPC da E39 (PR #764,
-- migration 20260925194151_dashboard_e39_sentiment_alerts_rpc.sql), SECURITY
-- DEFINER com guard interno is_admin_or_supervisor(auth.uid()).
--
-- Validacao exaustiva pos-merge do #764 (25/09) achou GRANT EXECUTE tambem
-- para anon e PUBLIC, alem do authenticated esperado. Nao e falha de
-- seguranca de fato -- anon nunca tem auth.uid() valido, o guard bloqueia --
-- mas e mais permissivo que o necessario: so' o front chama essa RPC, e so'
-- via sessao authenticated.
--
-- Mesmo padrao de fechamento ja usado em
-- 20260925203000_revoke_anon_execute_cron_only_functions.sql: REVOKE FROM
-- PUBLIC sozinho nao basta (grant individual de anon sobrevive via ALTER
-- DEFAULT PRIVILEGES de fabrica do Supabase), por isso revoga os dois
-- explicitamente. service_role e postgres mantidos (uso legitimo
-- interno/MCP, nao passam pelo guard de qualquer forma).

REVOKE EXECUTE ON FUNCTION public.dashboard_sentiment_alerts(timestamp with time zone) FROM PUBLIC, anon;
