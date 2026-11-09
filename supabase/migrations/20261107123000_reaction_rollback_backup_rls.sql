SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "No client access to reaction rollback backup" ON public._rb_message_reactions_one_per_agent_20261107121000;

CREATE POLICY "No client access to reaction rollback backup"
ON public._rb_message_reactions_one_per_agent_20261107121000
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
