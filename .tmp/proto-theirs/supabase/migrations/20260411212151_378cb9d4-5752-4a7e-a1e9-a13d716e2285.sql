
-- Drop the overly permissive supervisor policy that exposes credentials
DROP POLICY IF EXISTS "Supervisors read-only channels via safe columns" ON public.channel_connections;

-- Do NOT recreate a direct table policy for supervisors
-- They must use channel_connections_safe view which already excludes credentials
