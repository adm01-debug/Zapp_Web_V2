-- 1. Fix profiles privilege escalation via SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.update_own_profile(
  p_display_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_signature TEXT DEFAULT NULL,
  p_birthday TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE profiles SET
    display_name = COALESCE(p_display_name, display_name),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    phone = COALESCE(p_phone, phone),
    email = COALESCE(p_email, email),
    signature = COALESCE(p_signature, signature),
    birthday = COALESCE(p_birthday, birthday),
    updated_at = now()
  WHERE id = v_profile_id;

  RETURN TRUE;
END;
$$;

-- 2. Fix security infrastructure tables: admin-only (not supervisor)
DROP POLICY IF EXISTS "Admins can manage blocked IPs" ON public.blocked_ips;
CREATE POLICY "Only admins can view blocked IPs"
ON public.blocked_ips FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  OR is_admin_or_supervisor(auth.uid())
);

-- Restrict login_attempts to admin-only SELECT
DROP POLICY IF EXISTS "Admin can view login attempts" ON public.login_attempts;
CREATE POLICY "Only admins can view login attempts"
ON public.login_attempts FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- 3. Add admin SELECT policy for user_devices
CREATE POLICY "Admins can view all user devices"
ON public.user_devices FOR SELECT
TO authenticated
USING (is_admin_or_supervisor(auth.uid()));
