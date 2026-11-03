REVOKE EXECUTE ON FUNCTION public.audit_contact_address_change() FROM PUBLIC, anon, authenticated, service_role

REVOKE EXECUTE ON FUNCTION public.audit_role_changes() FROM PUBLIC, anon, authenticated, service_role

REVOKE EXECUTE ON FUNCTION public.audit_role_permissions_changes() FROM PUBLIC, anon, authenticated, service_role

REVOKE EXECUTE ON FUNCTION public.department_audit_logs_fill_profile_name() FROM PUBLIC, anon, authenticated, service_role

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM authenticated, service_role

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.department_audit_logs FROM authenticated, service_role

REVOKE TRUNCATE ON TABLE public.contacts FROM service_role
