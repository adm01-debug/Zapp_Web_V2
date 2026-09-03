-- 20260902000600_fix_record_failed_login_acl
-- REVOKE de PUBLIC/anon em record_failed_login (least privilege).

REVOKE EXECUTE ON FUNCTION public.record_failed_login(text, text, text) FROM PUBLIC","REVOKE EXECUTE ON FUNCTION public.record_failed_login(text, text, text) FROM anon
