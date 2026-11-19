DROP POLICY "Authenticated users can view analyses" ON public.conversation_analyses

CREATE POLICY "Authenticated users can view analyses" ON public.conversation_analyses
  FOR SELECT TO authenticated
  USING ( public.is_contact_visible_to_user(contact_id, auth.uid()) )

DROP POLICY "Authenticated can view ai tags" ON public.ai_conversation_tags

CREATE POLICY "Authenticated can view ai tags" ON public.ai_conversation_tags
  FOR SELECT TO authenticated
  USING ( public.is_contact_visible_to_user(contact_id, auth.uid()) )
