DROP FUNCTION IF EXISTS public.update_own_profile(text, text, text, text, text, text)

CREATE OR REPLACE FUNCTION public.update_own_profile(
  p_display_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_signature TEXT DEFAULT NULL,
  p_birthday TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE profiles SET
    name = COALESCE(p_display_name, name),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    phone = COALESCE(p_phone, phone),
    signature = COALESCE(p_signature, signature),
    birthday = COALESCE(NULLIF(p_birthday, '')::date, birthday),
    updated_at = now()
  WHERE id = v_profile_id;

  RETURN TRUE;
END;
$$

REVOKE ALL ON FUNCTION public.update_own_profile(text, text, text, text, text) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.update_own_profile(text, text, text, text, text) TO authenticated, service_role
