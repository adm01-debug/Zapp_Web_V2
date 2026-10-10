
-- channel_connections: agents need to see channels for UI
-- The "Only admins can view channel connections" policy + "Admins can manage channels" ALL policy 
-- already exist. We need to add a broader SELECT for agents (without credentials visible at app level)
CREATE POLICY "Agents can view channel connections"
ON public.channel_connections
FOR SELECT
TO authenticated
USING (true);

-- Create secure function for credentials access
CREATE OR REPLACE FUNCTION public.get_channel_credentials(_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT credentials FROM public.channel_connections WHERE id = _connection_id);
END;
$$;

-- query_telemetry: scope to own data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'query_telemetry' AND schemaname = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can view telemetry" ON public.query_telemetry';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated can view all telemetry" ON public.query_telemetry';
    
    -- Check if there's any SELECT policy with USING(true) and drop it
    PERFORM 1 FROM pg_policies 
    WHERE tablename = 'query_telemetry' AND schemaname = 'public' AND cmd = 'SELECT' AND qual = 'true';
    
    IF FOUND THEN
      -- Drop all SELECT policies and recreate scoped ones
      EXECUTE 'CREATE POLICY "Users can view own telemetry" ON public.query_telemetry FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin_or_supervisor(auth.uid()))';
    END IF;
  END IF;
END$$;
