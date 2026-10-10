
-- Fix stickers: uploaded_by is TEXT, cast auth.uid() to text
DROP POLICY IF EXISTS "Users can update own stickers" ON public.stickers;
DROP POLICY IF EXISTS "Users can delete own stickers" ON public.stickers;

CREATE POLICY "Users can update own stickers"
  ON public.stickers FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid()::text OR public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (uploaded_by = auth.uid()::text OR public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Users can delete own stickers"
  ON public.stickers FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid()::text OR public.is_admin_or_supervisor(auth.uid()));
