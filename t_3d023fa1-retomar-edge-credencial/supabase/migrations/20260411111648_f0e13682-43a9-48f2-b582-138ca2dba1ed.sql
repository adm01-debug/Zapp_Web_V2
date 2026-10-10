-- Remove agent direct access to channel_connections (has credentials)
DROP POLICY IF EXISTS "Agents can view assigned channels" ON public.channel_connections;
DROP POLICY IF EXISTS "Supervisors can view channels" ON public.channel_connections;

-- Keep admin-only full access, supervisors via SELECT without credentials
CREATE POLICY "Supervisors read-only channels"
ON public.channel_connections
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'supervisor'));

-- Remove agent direct access to whatsapp_connections (has qr_code, instance_id)
DROP POLICY IF EXISTS "Agents can view assigned connections" ON public.whatsapp_connections;

-- Agents access via whatsapp_connections_safe and channel_connections_safe views
-- Grant SELECT on safe views to authenticated role
GRANT SELECT ON public.whatsapp_connections_safe TO authenticated;
GRANT SELECT ON public.channel_connections_safe TO authenticated;