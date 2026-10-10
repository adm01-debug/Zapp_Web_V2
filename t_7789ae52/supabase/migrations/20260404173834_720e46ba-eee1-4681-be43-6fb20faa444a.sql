
-- The view already exists and correctly excludes reset_token
-- Just ensure security_invoker is set
ALTER VIEW public.password_reset_requests_safe SET (security_invoker = on);
