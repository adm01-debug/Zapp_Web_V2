DROP POLICY IF EXISTS "Users can view own catalog send events" ON public.catalog_send_events;

CREATE POLICY "Users can view own catalog send events"
ON public.catalog_send_events
FOR SELECT
TO authenticated
USING (
  agent_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

DROP POLICY IF EXISTS "Users can manage own catalog favorites" ON public.catalog_favorites;

CREATE POLICY "Users can manage own catalog favorites"
ON public.catalog_favorites
FOR ALL
TO authenticated
USING (user_id = auth.uid());
