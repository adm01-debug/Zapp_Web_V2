
-- FIX 1: channel_connections - Remove overly permissive SELECT
DROP POLICY IF EXISTS "Authenticated users can view channels" ON public.channel_connections;

-- FIX 2: whatsapp_connections - Restrict SELECT
DROP POLICY IF EXISTS "Authenticated users can view connections" ON public.whatsapp_connections;

CREATE POLICY "Admin supervisor can view connections"
ON public.whatsapp_connections
FOR SELECT
TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

-- Secure view for agents (no qr_code, no instance_id)
CREATE OR REPLACE VIEW public.whatsapp_connections_public AS
SELECT id, name, phone_number, status, is_default
FROM public.whatsapp_connections;
