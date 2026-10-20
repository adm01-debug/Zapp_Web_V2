-- Recreate safe view that NEVER exposes reset_token
DROP VIEW IF EXISTS public.password_reset_requests_safe;

CREATE VIEW public.password_reset_requests_safe WITH (security_invoker = on) AS
SELECT 
  id, user_id, email, reason, status, reviewed_by, reviewed_at,
  rejection_reason, (reset_token IS NOT NULL) AS has_token,
  token_expires_at, ip_address, user_agent, created_at, updated_at
FROM public.password_reset_requests;