
-- Fix views to use SECURITY INVOKER instead of SECURITY DEFINER
ALTER VIEW public.whatsapp_connections_agent SET (security_invoker = on);
ALTER VIEW public.channel_connections_safe SET (security_invoker = on);
