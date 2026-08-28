-- Onda 3: Hardening — revoke EXECUTE FROM anon on SECURITY DEFINER public functions
-- that are not part of pre-auth flows. Pre-auth functions (geo/IP gating, login
-- attempt tracking, password-reset token validation) keep anon EXECUTE.

DO $$
DECLARE
  r RECORD;
  pre_auth_funcs TEXT[] := ARRAY[
    'is_country_blocked','is_country_allowed','is_ip_blocked','is_ip_whitelisted',
    'is_account_locked','record_failed_login','clear_login_attempts',
    'validate_reset_token','get_own_lockout_status'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT (p.proname = ANY(pre_auth_funcs))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;