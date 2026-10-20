
-- Allow agents to delete AI tags on their own assigned contacts
CREATE POLICY "Agents can delete tags on assigned contacts"
ON public.ai_conversation_tags
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contacts c
    JOIN public.profiles p ON p.id = c.assigned_to
    WHERE c.id = ai_conversation_tags.contact_id
      AND p.user_id = auth.uid()
  )
  OR public.is_admin_or_supervisor(auth.uid())
);
