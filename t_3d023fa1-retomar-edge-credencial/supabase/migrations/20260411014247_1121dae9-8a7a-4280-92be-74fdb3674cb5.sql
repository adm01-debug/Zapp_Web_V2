
DROP VIEW IF EXISTS public.password_reset_requests_safe;

CREATE VIEW public.password_reset_requests_safe
WITH (security_invoker = on)
AS
SELECT
  id,
  user_id,
  email,
  reason,
  status,
  reviewed_by,
  reviewed_at,
  rejection_reason,
  token_expires_at,
  created_at,
  updated_at
FROM public.password_reset_requests;

GRANT SELECT ON public.password_reset_requests_safe TO authenticated;
GRANT SELECT ON public.password_reset_requests_safe TO service_role;

COMMENT ON VIEW public.password_reset_requests_safe IS 'Safe view hiding reset_token, ip_address, and user_agent columns';
