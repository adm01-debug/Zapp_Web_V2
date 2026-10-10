
-- Fix: stickers - uploaded_by is text, cast auth.uid() to text
DROP POLICY IF EXISTS "Authenticated users can insert stickers" ON public.stickers;
CREATE POLICY "Authenticated users can insert stickers" ON public.stickers
  FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid()::text OR is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can update stickers" ON public.stickers;
CREATE POLICY "Authenticated users can update stickers" ON public.stickers
  FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid()::text OR is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can delete stickers" ON public.stickers;
CREATE POLICY "Authenticated users can delete stickers" ON public.stickers
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid()::text OR is_admin_or_supervisor(auth.uid()));
