
-- Drop the safe view - it's unnecessary since admin panel queries table directly
-- and regular users don't need to see reset request details
DROP VIEW IF EXISTS public.password_reset_requests_safe;

-- Remove phone_number from whatsapp_connections_public
DROP VIEW IF EXISTS public.whatsapp_connections_public;
CREATE VIEW public.whatsapp_connections_public
WITH (security_invoker = true) AS
SELECT id, name, status, is_default
FROM public.whatsapp_connections;
GRANT SELECT ON public.whatsapp_connections_public TO authenticated;

-- Ensure login_attempts has no INSERT for authenticated
-- Create a restrictive INSERT policy that blocks authenticated users
CREATE POLICY "Only service role can insert login attempts"
ON public.login_attempts FOR INSERT TO authenticated
WITH CHECK (false);
