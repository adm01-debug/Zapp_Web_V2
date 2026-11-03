DROP POLICY IF EXISTS "Users can insert own catalog send events" ON public.catalog_send_events;

CREATE POLICY "Users can insert own catalog send events"
ON public.catalog_send_events
FOR INSERT
TO authenticated
WITH CHECK (
  agent_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);
