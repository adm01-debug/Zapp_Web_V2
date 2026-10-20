-- Revoke EXECUTE from anon on record_failed_login: the frontend now calls
-- the record-failed-login edge function (service_role) instead of RPC directly.
-- This closes the DoS vector where any anon could lock any account via direct RPC.
REVOKE EXECUTE ON FUNCTION public.record_failed_login(TEXT, TEXT, TEXT) FROM anon;
