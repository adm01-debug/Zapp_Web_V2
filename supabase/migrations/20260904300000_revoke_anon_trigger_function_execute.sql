-- Trigger functions are called by the DB engine, never directly by clients.
-- Granting EXECUTE on them to anon/authenticated is unnecessary surface area.
REVOKE EXECUTE ON FUNCTION public.messages_sla_first_response_trigger() FROM anon, authenticated;
