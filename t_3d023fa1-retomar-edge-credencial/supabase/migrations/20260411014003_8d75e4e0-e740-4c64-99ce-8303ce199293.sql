
DROP VIEW IF EXISTS public.gmail_accounts_safe;

CREATE VIEW public.gmail_accounts_safe
WITH (security_invoker = on)
AS
SELECT
  id,
  user_id,
  email_address,
  is_active,
  sync_status,
  last_sync_at,
  last_error,
  created_at,
  updated_at
FROM public.gmail_accounts;

GRANT SELECT ON public.gmail_accounts_safe TO authenticated;
GRANT SELECT ON public.gmail_accounts_safe TO service_role;

COMMENT ON VIEW public.gmail_accounts_safe IS 'Safe view of gmail_accounts that excludes sensitive OAuth tokens (security_invoker)';
