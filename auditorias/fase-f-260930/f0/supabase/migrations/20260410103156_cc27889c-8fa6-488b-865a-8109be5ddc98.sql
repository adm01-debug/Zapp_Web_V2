
-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Users can request password reset" ON public.password_reset_requests;

-- Create restricted INSERT policy that prevents clients from setting token fields
-- We use a trigger to enforce that reset_token and token_expires_at are always NULL on client inserts
CREATE OR REPLACE FUNCTION public.sanitize_reset_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Authenticated users cannot set their own tokens - only server/service role can
  IF auth.uid() IS NOT NULL THEN
    NEW.reset_token := NULL;
    NEW.token_expires_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

-- Drop if exists to avoid duplicates
DROP TRIGGER IF EXISTS sanitize_reset_request_trigger ON public.password_reset_requests;

CREATE TRIGGER sanitize_reset_request_trigger
BEFORE INSERT ON public.password_reset_requests
FOR EACH ROW
EXECUTE FUNCTION public.sanitize_reset_request();

-- Recreate the INSERT policy
CREATE POLICY "Users can request password reset"
ON public.password_reset_requests
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
