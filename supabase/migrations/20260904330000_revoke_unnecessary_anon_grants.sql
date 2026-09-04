-- Revoke anon/authenticated EXECUTE on functions that have no legitimate
-- reason to be called directly by clients.
--
-- calculate_level(integer): pure math helper. Used only server-side in
-- triggers and edge functions. anon calling it is unused surface area.
--
-- normalize_contact_phone(): trigger function — called exclusively by the
-- DB engine on INSERT/UPDATE. No client should ever invoke it directly.
-- Previous migration already revoked it for messages_sla_first_response_trigger;
-- this closes the same gap for this trigger function.
REVOKE EXECUTE ON FUNCTION public.calculate_level(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_contact_phone() FROM anon, authenticated;
