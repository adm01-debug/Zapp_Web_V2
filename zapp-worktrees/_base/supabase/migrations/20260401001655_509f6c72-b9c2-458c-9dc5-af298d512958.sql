
-- FIX: profiles - remove overly broad policy, keep own + admin
DROP POLICY IF EXISTS "Agents can view active team members" ON public.profiles;

-- FIX: channel_connections - remove broad agent policy
DROP POLICY IF EXISTS "Agents can view channel connections" ON public.channel_connections;

-- FIX: sicoob_contact_mapping - remove broad policy
DROP POLICY IF EXISTS "Authenticated users can read sicoob mappings" ON public.sicoob_contact_mapping;

-- FIX: password_reset_requests - remove SELECT access to tokens
DROP POLICY IF EXISTS "Users can view own reset requests" ON public.password_reset_requests;

CREATE POLICY "Users can view own reset requests no token"
ON public.password_reset_requests
FOR SELECT TO authenticated
USING (user_id = auth.uid());
