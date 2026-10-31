-- CRITICAL-1 (auditoria 2026-10-25): 99 tabelas de public davam INSERT/UPDATE/DELETE/TRUNCATE ao role anon.
-- A unica escrita anonima legitima e o formulario "Esqueci a senha" (src/pages/ForgotPassword.tsx:56),
-- protegida pela policy "Anon can file a password reset request". Idempotente e aditiva em seguranca.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;
GRANT INSERT ON public.password_reset_requests TO anon;
