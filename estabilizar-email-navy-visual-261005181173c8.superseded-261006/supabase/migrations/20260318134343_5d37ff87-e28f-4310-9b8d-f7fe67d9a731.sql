
-- Fix SECURITY DEFINER view: use SECURITY INVOKER instead
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public
WITH (security_invoker = true) AS
SELECT id, user_id, name, avatar_url, is_active, department, job_title
FROM public.profiles;

-- Grant SELECT on the view to authenticated users
GRANT SELECT ON public.profiles_public TO authenticated;
