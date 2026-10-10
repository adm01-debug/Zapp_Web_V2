
DROP POLICY IF EXISTS "Authenticated users can insert telemetry" ON public.query_telemetry;

CREATE POLICY "Users can insert own telemetry"
ON public.query_telemetry
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
