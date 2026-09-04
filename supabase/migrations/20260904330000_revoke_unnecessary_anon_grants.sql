-- Revoke EXECUTE from anon and authenticated on utility functions that
-- should only be called internally (no legitimate client-side use case).
REVOKE EXECUTE ON FUNCTION public.calculate_level(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_contact_phone() FROM anon, authenticated;
