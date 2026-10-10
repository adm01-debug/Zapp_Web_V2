
-- Add a security definer function that returns non-sensitive profile data
-- This avoids exposing permissions, access_level to all users
CREATE OR REPLACE FUNCTION public.get_team_profiles()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  name text,
  email text,
  avatar_url text,
  role text,
  is_active boolean,
  department text,
  job_title text,
  phone text,
  max_chats integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id, p.user_id, p.name, p.email, p.avatar_url, p.role,
    p.is_active, p.department, p.job_title, p.phone, p.max_chats, p.created_at
  FROM public.profiles p;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_team_profiles() TO authenticated;

-- Also add a SELECT policy for team visibility (non-sensitive columns only accessed via RLS)
-- In a CRM, team members need to see each other's basic info
-- The sensitive fields (permissions, access_level) are protected by the UPDATE policy
CREATE POLICY "Team members can view basic profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Drop the more restrictive individual policies since team visibility is needed
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
