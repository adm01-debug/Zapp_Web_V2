CREATE OR REPLACE FUNCTION public.record_failed_login(
  p_email TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE(is_locked BOOLEAN, locked_until TIMESTAMP WITH TIME ZONE, attempts INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count INTEGER;
  v_locked_until TIMESTAMP WITH TIME ZONE;
  v_max_attempts CONSTANT INTEGER := 5;
BEGIN
  INSERT INTO public.login_attempts AS la (email, ip_address, user_agent, attempt_count, last_attempt_at, updated_at)
  VALUES (LOWER(p_email), p_ip_address, p_user_agent, 1, now(), now())
  ON CONFLICT (email) DO UPDATE
    SET attempt_count = CASE
          WHEN la.locked_until IS NOT NULL AND la.locked_until <= now()
          THEN 1
          ELSE LEAST(la.attempt_count + 1, 10000)
        END,
        last_attempt_at = now(),
        ip_address = COALESCE(EXCLUDED.ip_address, la.ip_address),
        user_agent = COALESCE(EXCLUDED.user_agent, la.user_agent),
        updated_at = now()
  RETURNING attempt_count INTO v_new_count;

  IF v_new_count >= v_max_attempts THEN
    v_locked_until := now() + (POWER(2, LEAST(v_new_count - v_max_attempts, 10))::INTEGER * INTERVAL '1 minute');
    UPDATE public.login_attempts
    SET locked_until = v_locked_until, updated_at = now()
    WHERE email = LOWER(p_email);
  ELSE
    v_locked_until := NULL;
  END IF;

  RETURN QUERY SELECT
    v_locked_until IS NOT NULL AND v_locked_until > now(),
    v_locked_until,
    v_new_count;
END;
$$

ALTER TABLE public.login_attempts
  ADD CONSTRAINT login_attempts_attempt_count_max CHECK (attempt_count <= 10000)

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.login_attempts FROM anon

REVOKE EXECUTE ON FUNCTION public.is_account_locked(TEXT) FROM authenticated
