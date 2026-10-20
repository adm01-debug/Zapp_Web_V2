
DROP POLICY IF EXISTS "Admins can view AI providers" ON public.ai_providers;
CREATE POLICY "Admins can view AI providers"
  ON public.ai_providers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
