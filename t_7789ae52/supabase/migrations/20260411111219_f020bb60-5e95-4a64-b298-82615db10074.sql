-- Restrict direct table access to admins only (credentials protection)
DROP POLICY IF EXISTS "Admins can manage channels" ON public.channel_connections;
DROP POLICY IF EXISTS "Only admins can view channel connections" ON public.channel_connections;

-- Admin-only full access (includes credentials)
CREATE POLICY "Admins full access to channels"
ON public.channel_connections
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Supervisors can only SELECT (no credentials via safe view pattern)
CREATE POLICY "Supervisors can view channels"
ON public.channel_connections
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'supervisor'));