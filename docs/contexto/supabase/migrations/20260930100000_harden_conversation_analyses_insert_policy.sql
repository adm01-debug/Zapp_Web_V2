DROP POLICY "Users can insert own analyses" ON public.conversation_analyses

CREATE POLICY "Users can insert own analyses" ON public.conversation_analyses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    analyzed_by = public.get_profile_id_for_user(auth.uid())
    AND public.is_contact_visible_to_user(contact_id, auth.uid())
  )

REVOKE ALL ON public.conversation_analyses FROM anon
