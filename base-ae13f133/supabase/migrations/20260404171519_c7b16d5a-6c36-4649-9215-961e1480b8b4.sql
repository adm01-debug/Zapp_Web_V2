
CREATE OR REPLACE FUNCTION public.validate_reset_token(p_token text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id
  FROM public.password_reset_requests
  WHERE reset_token = p_token
    AND status = 'pending'
    AND token_expires_at > now()
  LIMIT 1;
$$;
