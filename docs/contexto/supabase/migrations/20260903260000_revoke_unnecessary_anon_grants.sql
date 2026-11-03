-- 20260903260000_revoke_unnecessary_anon_grants
-- Renumerada de 20260903240000, que ja esta ocupada por revoke_excessive_anon_grants
-- (registrada no ledger e mergeada na main).
--
-- IMPORTANTE — por que e "FROM PUBLIC, anon" e nao so "FROM anon":
-- estas funcoes nao tem grant explicito para anon. A ACL vigente e
-- {=X/postgres,postgres=X,authenticated=X,service_role=X}: o "=X" e o grant de
-- PUBLIC, e anon executa por heranca. REVOKE ... FROM anon, sozinho, e um no-op
-- (o Postgres nao registra "negacao"; so remove grant que exista). Conferido na
-- ACL viva antes de escrever isto.
-- authenticated e service_role tem grant explicito, entao continuam podendo
-- executar depois do REVOKE de PUBLIC.

-- F-01 CRITICO: get_identity_matrix() faz JOIN auth.users+profiles+user_roles
-- sem WHERE nem checagem do caller — exfiltracao do diretorio inteiro.
-- Ja esta sem anon e sem PUBLIC na ACL viva; fica como garantia de replay.
REVOKE EXECUTE ON FUNCTION public.get_identity_matrix() FROM PUBLIC, anon;

-- F-02 ALTO: enumera status de lockout de qualquer e-mail, sem ownership check.
REVOKE EXECUTE ON FUNCTION public.get_own_lockout_status(text) FROM PUBLIC, anon;

-- F-03 ALTO: mapa completo de roles da organizacao.
REVOKE EXECUTE ON FUNCTION public.effective_role(uuid) FROM PUBLIC, anon;

-- F-04 ALTO: oracle binario de admin por UUID.
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;

-- F-05 MEDIO: expoe a configuracao da blocklist de IP.
REVOKE EXECUTE ON FUNCTION public.is_ip_blocked(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_ip_whitelisted(text) FROM PUBLIC, anon;

-- F-06 MEDIO: expoe a politica de geo-blocking.
REVOKE EXECUTE ON FUNCTION public.is_country_allowed(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_country_blocked(text) FROM PUBLIC, anon;

-- F-08 BAIXO: trigger functions nao precisam ser chamaveis por cliente nenhum.
REVOKE EXECUTE ON FUNCTION public.audit_role_permissions_changes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_profile_role_from_user_roles() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_thread_last_sender() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_device_last_seen() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_global_settings_updated_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;

-- is_account_locked NAO entra: e chamada em src/lib/loginAttempts.ts pela tela
-- de login, antes de existir sessao (roda como anon), e tem grant EXPLICITO
-- para anon na ACL viva (nao herda de PUBLIC). Revogar aqui repetiria a
-- regressao de 20260902000600/20260903170000, que desligou o lockout em
-- producao. O fix real e mover a chamada para o servidor.

-- A1-C9: assimetria de RLS em login_attempts — supervisors podiam DELETE mas nao SELECT.
DROP POLICY IF EXISTS "Only admins can view login attempts" ON public.login_attempts;
CREATE POLICY "Admins and supervisors can view login attempts"
  ON public.login_attempts FOR SELECT
  USING (is_admin_or_supervisor(auth.uid()));
