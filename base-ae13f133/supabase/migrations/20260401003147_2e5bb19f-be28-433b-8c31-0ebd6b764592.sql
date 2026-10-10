
-- 1. Make whatsapp-media bucket PRIVATE
UPDATE storage.buckets SET public = false WHERE id = 'whatsapp-media';

-- 2. Fix password_reset_requests: replace policy to exclude token column
-- We can't exclude columns via RLS, so use a SECURITY DEFINER function approach
-- Drop direct SELECT policies for non-admins
DROP POLICY IF EXISTS "Users can view own reset requests no token" ON public.password_reset_requests;

-- Keep admin policy, add a restricted user policy that works with the RPC function
-- Users should use the get_own_reset_requests() function instead
-- Add a policy that blocks direct SELECT for non-admins
CREATE POLICY "Only admins can directly select reset requests"
ON public.password_reset_requests FOR SELECT TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

-- Drop duplicate admin policy if exists
DROP POLICY IF EXISTS "Admins can view reset requests" ON public.password_reset_requests;

-- 3. Scope agent_achievements SELECT
DROP POLICY IF EXISTS "Anyone can view achievements" ON public.agent_achievements;
DROP POLICY IF EXISTS "Authenticated users can view achievements" ON public.agent_achievements;

CREATE POLICY "Users can view own or admin all achievements"
ON public.agent_achievements FOR SELECT TO authenticated
USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

-- 4. Scope agent_skills SELECT
DROP POLICY IF EXISTS "Anyone can view skills" ON public.agent_skills;
DROP POLICY IF EXISTS "Authenticated users can view skills" ON public.agent_skills;

CREATE POLICY "Users can view own or admin all skills"
ON public.agent_skills FOR SELECT TO authenticated
USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);
