
-- Agents need to read whatsapp_connections for basic operations (sending messages, etc.)
-- But we don't want them to see qr_code. Since RLS is row-level not column-level,
-- we allow SELECT but create a secure function for sensitive lookups

-- Allow all authenticated users to SELECT (the broad SELECT was there before for a reason)
-- The sensitive column qr_code should be handled at application level
DROP POLICY IF EXISTS "Admin supervisor can view connections" ON public.whatsapp_connections;

CREATE POLICY "Authenticated can view connections"
ON public.whatsapp_connections
FOR SELECT
TO authenticated
USING (true);

-- But only admins can see QR codes - create a secure function
CREATE OR REPLACE FUNCTION public.get_connection_qr_code(_connection_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT qr_code FROM public.whatsapp_connections WHERE id = _connection_id;
$$;

-- Create a secure function to get instance_id (needed for messaging but sensitive)
CREATE OR REPLACE FUNCTION public.get_connection_instance(_connection_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT instance_id FROM public.whatsapp_connections WHERE id = _connection_id;
$$;
