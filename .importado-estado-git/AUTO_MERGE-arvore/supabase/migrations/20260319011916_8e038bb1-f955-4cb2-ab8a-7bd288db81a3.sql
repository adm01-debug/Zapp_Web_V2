DROP POLICY IF EXISTS "Authenticated users can delete custom emojis" ON public.custom_emojis;
CREATE POLICY "Users can delete own or admin custom emojis"
ON public.custom_emojis
FOR DELETE
TO authenticated
USING ((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()));