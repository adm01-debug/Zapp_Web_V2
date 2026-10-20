-- Onda 3 (parte 2): A revogação anterior não surtiu efeito porque o privilégio
-- vem de PUBLIC (que anon herda). Revogar de PUBLIC e re-conceder explicitamente
-- a authenticated nas funções que o app realmente chama.

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
      AND NOT (p.proname = ANY(pre_auth_funcs))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;