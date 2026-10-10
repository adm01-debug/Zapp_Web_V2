
-- Fix query_telemetry duplicate policy
DROP POLICY IF EXISTS "Authenticated users can read telemetry" ON public.query_telemetry;

-- Fix sales_deals missing SELECT
CREATE POLICY "Users can view assigned or admin deals"
ON public.sales_deals FOR SELECT TO authenticated
USING (
  is_admin_or_supervisor(auth.uid())
  OR assigned_to IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Fix whatsapp_connections - restrict to admin/supervisor
DROP POLICY IF EXISTS "Authenticated can view connections" ON public.whatsapp_connections;
CREATE POLICY "Admin supervisor view connections"
ON public.whatsapp_connections FOR SELECT TO authenticated
USING (is_admin_or_supervisor(auth.uid()));
