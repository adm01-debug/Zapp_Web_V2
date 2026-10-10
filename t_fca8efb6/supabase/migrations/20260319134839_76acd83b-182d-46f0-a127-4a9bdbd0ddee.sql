
-- Fix: Allow all authenticated users to VIEW whatsapp_connections (needed for chat functionality)
-- Only admin/supervisor should manage (insert/update/delete)
DROP POLICY IF EXISTS "Admins can view whatsapp connections" ON public.whatsapp_connections;
DROP POLICY IF EXISTS "Admins can manage connections" ON public.whatsapp_connections;

-- SELECT: all authenticated users (agents need instance_id for sending messages)
CREATE POLICY "Authenticated users can view connections" ON public.whatsapp_connections
  FOR SELECT TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE: admin/supervisor only
CREATE POLICY "Admins can insert connections" ON public.whatsapp_connections
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admins can update connections" ON public.whatsapp_connections
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admins can delete connections" ON public.whatsapp_connections
  FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));
