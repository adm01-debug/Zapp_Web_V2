-- Remove the redundant admin-only INSERT policy (already covered by the broader one)
DROP POLICY IF EXISTS "Admins can insert conversation events" ON public.conversation_events;

-- Also tighten the remaining policy to ensure performed_by matches the current user
DROP POLICY IF EXISTS "Authorized users can insert events" ON public.conversation_events;

CREATE POLICY "Authorized users can insert events"
ON public.conversation_events
FOR INSERT
TO authenticated
WITH CHECK (
  -- The performer must be the current user's profile
  (performed_by IS NULL OR performed_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))
  AND (
    is_admin_or_supervisor(auth.uid())
    OR contact_id IN (
      SELECT c.id FROM contacts c
      WHERE c.assigned_to = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    )
  )
);