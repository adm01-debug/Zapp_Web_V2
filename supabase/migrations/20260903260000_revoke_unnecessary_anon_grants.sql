-- 20260903260000_revoke_unnecessary_anon_grants
-- Renumerada de 20260903240000 (ja ocupada por revoke_excessive_anon_grants).
--
-- IMPORTANTE: REVOKE ... FROM PUBLIC, anon (nao so FROM anon):
-- estas funcoes nao tem grant explicito para anon; a ACL tem "=X" (PUBLIC),
-- e anon herda. REVOKE ... FROM anon sozinho e no-op. Conferido na ACL viva.

-- F-01 CRITICO: get_identity_matrix() expoe diretorio inteiro.
REVOKE EXECUTE ON FUNCTION public.get_identity_matrix() FROM PUBLIC, anon;

-- F-02 ALTO: enumera lockout status de qualquer e-mail.
REVOKE EXECUTE ON FUNCTION public.get_own_lockout_status(text) FROM PUBLIC, anon;

-- F-03 ALTO: mapa completo de roles.
REVOKE EXECUTE ON FUNCTION public.effective_role(uuid) FROM PUBLIC, anon;

-- F-04 ALTO: oracle binario de admin por UUID.
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;

-- F-05 MEDIO: expoe config da blocklist de IP.
REVOKE EXECUTE ON FUNCTION public.is_ip_blocked(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_ip_whitelisted(text) FROM PUBLIC, anon;

-- F-06 MEDIO: expoe politica de geo-blocking.
REVOKE EXECUTE ON FUNCTION public.is_country_allowed(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_country_blocked(text) FROM PUBLIC, anon;

-- F-08 BAIXO: trigger functions nao precisam ser chamaveis por clientes.
REVOKE EXECUTE ON FUNCTION public.audit_role_permissions_changes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_profile_role_from_user_roles() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_thread_last_sender() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_device_last_seen() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_global_settings_updated_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;

-- is_account_locked NAO entra: chamada pelo frontend de login como anon,
-- tem grant explicito para anon na ACL viva. Revogar quebraria o lockout.

-- A1-C9: assimetria de RLS em login_attempts.
DROP POLICY IF EXISTS "Only admins can view login attempts" ON public.login_attempts;
CREATE POLICY "Admins and supervisors can view login attempts"
  ON public.login_attempts FOR SELECT
  USING (is_admin_or_supervisor(auth.uid()));
