
-- Fix validate_reset_token to use pgcrypto properly
CREATE OR REPLACE FUNCTION public.validate_reset_token(p_token text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_hashed text;
BEGIN
  v_hashed := encode(extensions.digest(p_token::bytea, 'sha256'), 'hex');
  
  SELECT user_id INTO v_user_id
  FROM public.password_reset_requests
  WHERE reset_token = v_hashed
    AND status = 'pending'
    AND token_expires_at > now()
  LIMIT 1;
  
  RETURN v_user_id;
END;
$$;

-- Also fix the trigger function
CREATE OR REPLACE FUNCTION public.hash_reset_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reset_token IS NOT NULL AND length(NEW.reset_token) != 64 THEN
    NEW.reset_token := encode(extensions.digest(NEW.reset_token::bytea, 'sha256'), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

-- Hash existing plaintext tokens
UPDATE public.password_reset_requests
SET reset_token = encode(extensions.digest(reset_token::bytea, 'sha256'), 'hex')
WHERE reset_token IS NOT NULL
  AND length(reset_token) != 64;
