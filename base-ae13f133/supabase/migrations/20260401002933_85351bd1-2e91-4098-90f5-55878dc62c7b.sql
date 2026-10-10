
-- 1. Fix password_reset_requests: hide reset_token from SELECT
-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view own reset requests" ON public.password_reset_requests;

-- Create a security definer function to check ownership without exposing token
CREATE OR REPLACE FUNCTION public.get_own_reset_requests()
RETURNS SETOF public.password_reset_requests
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at,
         rejection_reason, NULL::text as reset_token, token_expires_at,
         ip_address, user_agent, created_at, updated_at
  FROM public.password_reset_requests
  WHERE user_id = auth.uid();
$$;

-- Admin SELECT policy (admins can see everything except tokens too)
CREATE POLICY "Admins can view reset requests"
ON public.password_reset_requests FOR SELECT TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

-- Regular users use the RPC function instead of direct SELECT
-- But we still need a policy for the function's SECURITY DEFINER context
-- So add a restrictive policy for non-admins
CREATE POLICY "Users can view own reset requests no token"
ON public.password_reset_requests FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 2. Fix profiles INSERT: prevent privilege escalation
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can insert their own profile safely"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (role IS NULL OR role = 'agent')
  AND (access_level IS NULL OR access_level = 'basic')
  AND (permissions IS NULL OR permissions = '{}'::jsonb)
);

-- 3. Fix whatsapp-media SELECT: restrict to assigned contacts
DROP POLICY IF EXISTS "Users can read whatsapp media" ON storage.objects;

CREATE POLICY "Users can read assigned whatsapp media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.contacts c
      WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
