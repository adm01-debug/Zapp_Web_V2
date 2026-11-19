ALTER VIEW public.gmail_accounts_safe SET (security_invoker = true);

ALTER VIEW public.channel_connections_safe SET (security_invoker = true);

ALTER VIEW public.whatsapp_connections_agent SET (security_invoker = true);

ALTER VIEW public.password_reset_requests_safe SET (security_invoker = true);

CREATE POLICY "service_role inserts cache metrics" ON public.link_preview_cache_metrics FOR INSERT TO service_role WITH CHECK (true);

COMMENT ON FUNCTION ... x15 funcoes orfas (A-06);

COMMENT ON FUNCTION public.mask_channel_credentials() IS ...no-op;

COMMENT ON FUNCTION public.mcp_exec/mcp_exec_many IS ...infra MCP;
