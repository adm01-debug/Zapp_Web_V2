CREATE OR REPLACE FUNCTION public.sanitize_reset_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_canonical_email text;
  v_pending_count integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.token_expires_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.status := 'pending';
  ELSE
    SELECT u.id, u.email
      INTO v_user_id, v_canonical_email
      FROM auth.users u
     WHERE lower(btrim(u.email)) = lower(btrim(NEW.email))
     LIMIT 1;

    IF v_user_id IS NULL THEN
      RETURN NULL;
    END IF;

    SELECT COUNT(*)
      INTO v_pending_count
      FROM public.password_reset_requests
     WHERE user_id = v_user_id
       AND status = 'pending'
       AND created_at > now() - interval '1 hour';

    IF v_pending_count >= 3 THEN
      RETURN NULL;
    END IF;

    NEW.user_id := v_user_id;
    NEW.email := v_canonical_email;
    NEW.token_expires_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.status := 'pending';
  END IF;

  RETURN NEW;
END;
$function$

REVOKE EXECUTE ON FUNCTION public.sanitize_reset_request() FROM PUBLIC, anon, authenticated

DROP POLICY IF EXISTS "Anon can file a password reset request" ON public.password_reset_requests

CREATE POLICY "Anon can file a password reset request"
  ON public.password_reset_requests
  FOR INSERT
  TO anon
  WITH CHECK (
    user_id IS NOT NULL
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND rejection_reason IS NULL
    AND token_expires_at IS NULL
  )
