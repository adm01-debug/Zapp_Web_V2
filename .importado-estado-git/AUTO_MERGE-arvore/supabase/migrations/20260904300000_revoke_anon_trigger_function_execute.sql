-- Revoke trigger function EXECUTE from anon and authenticated:
-- messages_sla_first_response_trigger is a trigger function called internally
-- by PostgreSQL; it should never be callable by client roles.
REVOKE EXECUTE ON FUNCTION public.messages_sla_first_response_trigger() FROM anon, authenticated;
