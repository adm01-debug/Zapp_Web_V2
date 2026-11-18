-- FIX-S03-004: REVOKE TRUNCATE de tabelas sensiveis do role anon
-- Problema: Role `anon` possui privilegio TRUNCATE em ~50 tabelas incluindo
--           mfa_sessions, user_sessions, user_devices, notifications, security_alerts,
--           warroom_alerts, global_settings, ip_whitelist, payment_links, gmail_accounts.
--           TRUNCATE ignora RLS em PostgreSQL.
--
-- NAO APLICAR EM PRODUCAO SEM APROVACAO DO JOAQUIM

BEGIN;

REVOKE TRUNCATE ON TABLE public.mfa_sessions FROM anon;
REVOKE TRUNCATE ON TABLE public.user_sessions FROM anon;
REVOKE TRUNCATE ON TABLE public.user_devices FROM anon;
REVOKE TRUNCATE ON TABLE public.notifications FROM anon;
REVOKE TRUNCATE ON TABLE public.security_alerts FROM anon;
REVOKE TRUNCATE ON TABLE public.warroom_alerts FROM anon;
REVOKE TRUNCATE ON TABLE public.global_settings FROM anon;
REVOKE TRUNCATE ON TABLE public.ip_whitelist FROM anon;
REVOKE TRUNCATE ON TABLE public.payment_links FROM anon;
REVOKE TRUNCATE ON TABLE public.gmail_accounts FROM anon;

-- Verificacao pos-apply:
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND privilege_type = 'TRUNCATE'
  AND table_name IN (
    'mfa_sessions','user_sessions','user_devices','notifications',
    'security_alerts','warroom_alerts','global_settings','ip_whitelist',
    'payment_links','gmail_accounts'
  );
-- Deve retornar 0 rows

COMMIT;

-- RISCO DE REGRESSAO: BAIXO
-- PostgREST nao expoe TRUNCATE; nenhuma edge function identificada chamando TRUNCATE direto.
