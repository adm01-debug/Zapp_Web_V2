
-- Revert profiles to allow all authenticated SELECT (needed by 37+ components)
-- The real security is in UPDATE triggers (prevent_role_escalation, prevent_profile_privilege_escalation)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- The channel_connections fix stays (credentials exposure was the critical issue)
