
-- Drop the view since it can't have RLS and the scanner flags it
DROP VIEW IF EXISTS public.login_attempts_safe;

-- The login_attempts table already has admin-only SELECT
-- Regular users check their lockout status via the checkAccountLock function in the frontend
-- which calls from('login_attempts').select() - this needs to work for their own email
-- So restore a user-scoped policy but exclude sensitive fields via a function

CREATE OR REPLACE FUNCTION public.get_own_lockout_status(p_email text)
RETURNS TABLE(attempt_count integer, locked_until timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT la.attempt_count, la.locked_until
  FROM login_attempts la
  WHERE la.email = p_email
  ORDER BY la.created_at DESC
  LIMIT 1;
$$;
