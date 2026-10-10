-- Recuperado de supabase_migrations.schema_migrations.statements em 27/08/2026.
-- Aplicado direto no banco em 26/08/2026. Este arquivo apenas versiona o que ja
-- existe no destino. Ver docs/MIGRATIONS.md.

ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_connections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.security_alerts;

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.team_messages REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_connections REPLICA IDENTITY FULL;
ALTER TABLE public.contacts REPLICA IDENTITY FULL;
ALTER TABLE public.talkx_campaigns REPLICA IDENTITY FULL;
ALTER TABLE public.security_alerts REPLICA IDENTITY FULL;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_sla REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.queues REPLICA IDENTITY FULL;
ALTER TABLE public.queue_members REPLICA IDENTITY FULL;
