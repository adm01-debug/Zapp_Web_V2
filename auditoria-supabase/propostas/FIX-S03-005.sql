-- FIX-S03-005: REVOKE SELECT de tabelas sensiveis do role anon
-- Problema: Role `anon` possui SELECT grants em tabelas sensiveis.
--
-- NAO APLICAR EM PRODUCAO SEM APROVACAO DO JOAQUIM
-- ATENCAO: Verificar quais tabelas o front acessa com anon key antes de revogar.

BEGIN;

-- Revogar SELECT para tabelas que definitivamente nao devem ser acessiveis sem autenticacao:
REVOKE SELECT ON TABLE public.mfa_sessions FROM anon;
REVOKE SELECT ON TABLE public.user_sessions FROM anon;
REVOKE SELECT ON TABLE public.user_devices FROM anon;
REVOKE SELECT ON TABLE public.security_alerts FROM anon;
REVOKE SELECT ON TABLE public.webauthn_challenges FROM anon;
REVOKE SELECT ON TABLE public.gmail_accounts FROM anon;
REVOKE SELECT ON TABLE public.rate_limit_logs FROM anon;
REVOKE SELECT ON TABLE public.user_service_accounts FROM anon;

-- Verificacao:
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND privilege_type = 'SELECT'
  AND table_name IN (
    'mfa_sessions','user_sessions','user_devices','security_alerts',
    'webauthn_challenges','gmail_accounts','rate_limit_logs','user_service_accounts'
  )
ORDER BY table_name;
-- Deve retornar 0 rows

COMMIT;

-- RISCO DE REGRESSAO: MEDIO
-- Verificar quais tabelas o front usa com anon key antes de aplicar em producao.
