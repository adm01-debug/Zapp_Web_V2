-- Z060: REVOKE SELECT de anon em todas as tabelas do schema public
--
-- Diagnóstico (2026-11-08) no banco canônico tnnnlkbymytvtqngbbqh:
--   SELECT COUNT(*) FROM information_schema.role_table_grants
--   WHERE grantee='anon' AND table_schema='public'
--   → 100 grants (99 SELECT + 1 INSERT em password_reset_requests)
--
-- Histórico:
--   • 20261016250000 removeu INSERT/UPDATE/DELETE de anon em todas as tabelas
--     e restaurou apenas INSERT em password_reset_requests (fluxo "esqueci senha").
--   • 20261030135126 removeu TRUNCATE/REFERENCES/TRIGGER.
--   • SELECT ficou intacto nas 99 tabelas — residual do GRANT ON ALL TABLES
--     original do Supabase.
--
-- Prova em Postgres temporário (2026-11-08):
--   • anon SELECT em mfa_sessions, user_sessions, user_devices, user_roles,
--     profiles, gmail_accounts, channel_connections, security_alerts →
--     0 linhas retornadas em todas (RLS sem policy anon = deny-all). NÃO
--     exploráveis hoje para exfiltração de dados.
--   • PORÉM: seguindo o princípio de menor privilégio, grants de SELECT que
--     nunca são usados pela aplicação como anon ampliam a superfície de ataque
--     — qualquer policy futura descuidada que esqueça de restringir roles
--     expõe dados imediatamente.
--   • Após REVOKE: has_table_privilege('anon','user_roles','SELECT') = f,
--     has_table_privilege('anon','mfa_sessions','SELECT') = f,
--     has_table_privilege('anon','profiles','SELECT') = f.
--     has_table_privilege('anon','password_reset_requests','INSERT') = t  ← preservado.
--
-- Fluxos validados intactos após REVOKE:
--   • Fluxo "esqueci minha senha": anon faz INSERT em password_reset_requests
--     — INSERT grant e policy RLS preservados, INSERT continua funcionando.
--   • Login/registro: via auth.signIn/signUp (GoTrue), não usa tabelas de public
--     como anon — sem impacto.
--   • App autenticado: role authenticated não é afetado por esta migration.
--
-- Rollback (reversível):
--   GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon;

-- Restaurar SELECT em views públicas que o front usa sem autenticação (nenhuma
-- identificada no audit; comentário aqui como ponto de extensão se necessário):
-- GRANT SELECT ON public.<view_publica> TO anon;

-- Ajusta defaults para novas tabelas criadas futuramente:
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT ON TABLES FROM anon;
