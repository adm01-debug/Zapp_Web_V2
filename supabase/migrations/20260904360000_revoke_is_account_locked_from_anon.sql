-- Revoke is_account_locked from anon: all callers go through the
-- check-account-lock edge function (service_role). Direct anon access
-- enables account enumeration via attempt counts.
REVOKE EXECUTE ON FUNCTION public.is_account_locked(TEXT) FROM anon;
