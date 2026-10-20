-- Create table for tracking failed login attempts
CREATE TABLE public.login_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  locked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(email)
);

-- Enable RLS
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- System can manage login attempts
CREATE POLICY "System can manage login attempts"
ON public.login_attempts
FOR ALL
USING (true)
WITH CHECK (true);

-- Create function to check if account is locked
CREATE OR REPLACE FUNCTION public.is_account_locked(check_email TEXT)
RETURNS TABLE(is_locked BOOLEAN, locked_until TIMESTAMP WITH TIME ZONE, attempts INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt RECORD;
BEGIN
  SELECT la.attempt_count, la.locked_until, la.last_attempt_at
  INTO v_attempt
  FROM public.login_attempts la
  WHERE la.email = LOWER(check_email);
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, 0;
    RETURN;
  END IF;
  
  -- Check if still locked
  IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until > now() THEN
    RETURN QUERY SELECT true, v_attempt.locked_until, v_attempt.attempt_count;
    RETURN;
  END IF;
  
  -- Not locked
  RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, v_attempt.attempt_count;
END;
$$;

-- Create function to record failed login attempt
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
  v_attempt RECORD;
  v_new_count INTEGER;
  v_lock_duration INTERVAL;
  v_locked_until TIMESTAMP WITH TIME ZONE;
  v_max_attempts INTEGER := 5;
BEGIN
  -- Get existing attempts
  SELECT la.attempt_count, la.locked_until, la.last_attempt_at
  INTO v_attempt
  FROM public.login_attempts la
  WHERE la.email = LOWER(p_email);
  
  IF NOT FOUND THEN
    -- First failed attempt
    INSERT INTO public.login_attempts (email, ip_address, user_agent, attempt_count)
    VALUES (LOWER(p_email), p_ip_address, p_user_agent, 1);
    
    RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, 1;
    RETURN;
  END IF;
  
  -- If previous lock expired, reset count
  IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until <= now() THEN
    v_new_count := 1;
  ELSE
    v_new_count := v_attempt.attempt_count + 1;
  END IF;
  
  -- Calculate lock duration with exponential backoff
  IF v_new_count >= v_max_attempts THEN
    -- Lock duration: 2^(attempts - max_attempts) minutes, starting at 1 minute
    -- 5 attempts = 1 min, 6 = 2 min, 7 = 4 min, 8 = 8 min, etc.
    v_lock_duration := (POWER(2, LEAST(v_new_count - v_max_attempts, 10)))::INTEGER * INTERVAL '1 minute';
    v_locked_until := now() + v_lock_duration;
  ELSE
    v_locked_until := NULL;
  END IF;
  
  -- Update attempt record
  UPDATE public.login_attempts
  SET 
    attempt_count = v_new_count,
    last_attempt_at = now(),
    locked_until = v_locked_until,
    ip_address = COALESCE(p_ip_address, login_attempts.ip_address),
    user_agent = COALESCE(p_user_agent, login_attempts.user_agent),
    updated_at = now()
  WHERE email = LOWER(p_email);
  
  RETURN QUERY SELECT 
    v_locked_until IS NOT NULL AND v_locked_until > now(),
    v_locked_until,
    v_new_count;
END;
$$;

-- Create function to clear login attempts on successful login
CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
END;
$$;

-- Add index for faster lookups
CREATE INDEX idx_login_attempts_email ON public.login_attempts(email);
CREATE INDEX idx_login_attempts_locked ON public.login_attempts(locked_until) WHERE locked_until IS NOT NULL;