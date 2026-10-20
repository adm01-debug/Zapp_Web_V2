-- Prevent any role from modifying reset_token via UPDATE
CREATE OR REPLACE FUNCTION public.protect_reset_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If reset_token is being changed and the caller is not service_role
  IF OLD.reset_token IS DISTINCT FROM NEW.reset_token THEN
    -- Only allow if current_setting indicates service_role context
    IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
      RAISE EXCEPTION 'Cannot modify reset_token via client';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS protect_reset_token_trigger ON public.password_reset_requests;
CREATE TRIGGER protect_reset_token_trigger
BEFORE UPDATE ON public.password_reset_requests
FOR EACH ROW
EXECUTE FUNCTION public.protect_reset_token();