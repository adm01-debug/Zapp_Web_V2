
DROP VIEW IF EXISTS public.password_reset_requests_safe;
CREATE VIEW public.password_reset_requests_safe
WITH (security_invoker = true) AS
SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at, 
       rejection_reason, token_expires_at, ip_address, user_agent, 
       created_at, updated_at
FROM public.password_reset_requests;

GRANT SELECT ON public.password_reset_requests_safe TO authenticated;
