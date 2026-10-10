-- Fix login_attempts: use has_role() instead of raw subquery
DROP POLICY IF EXISTS "Only admins can view login attempts" ON public.login_attempts;
CREATE POLICY "Only admins can view login attempts"
ON public.login_attempts
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Allow agents to read WhatsApp connections via safe view columns only
-- Agents need connection metadata (name, status) for their assigned contacts
DROP POLICY IF EXISTS "Agents can view assigned connections" ON public.whatsapp_connections;
CREATE POLICY "Agents can view assigned connections"
ON public.whatsapp_connections
FOR SELECT
TO authenticated
USING (
  is_admin_or_supervisor(auth.uid())
  OR id IN (
    SELECT DISTINCT c.whatsapp_connection_id 
    FROM public.contacts c 
    WHERE c.assigned_to IN (
      SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
    AND c.whatsapp_connection_id IS NOT NULL
  )
);

-- Allow agents to read channel connections they work with (via safe view pattern)
DROP POLICY IF EXISTS "Agents can view assigned channels" ON public.channel_connections;
CREATE POLICY "Agents can view assigned channels"
ON public.channel_connections
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'supervisor')
  OR id IN (
    SELECT DISTINCT c.channel_connection_id
    FROM public.contacts c
    WHERE c.assigned_to IN (
      SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
    AND c.channel_connection_id IS NOT NULL
  )
);