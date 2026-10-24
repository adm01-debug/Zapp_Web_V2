
-- Fix UPDATE policy to include WITH CHECK clause
DROP POLICY IF EXISTS "Admin/supervisor can update automations" ON public.automations;
CREATE POLICY "Admin/supervisor can update automations"
  ON public.automations FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
