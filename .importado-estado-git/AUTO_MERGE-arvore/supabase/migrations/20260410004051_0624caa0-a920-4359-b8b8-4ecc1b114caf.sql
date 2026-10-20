-- Remove sensitive tables from Realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.ai_usage_logs;
ALTER PUBLICATION supabase_realtime DROP TABLE public.talkx_recipients;
ALTER PUBLICATION supabase_realtime DROP TABLE public.talkx_campaigns;