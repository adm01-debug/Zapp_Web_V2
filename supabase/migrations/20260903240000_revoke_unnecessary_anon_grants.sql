-- SECURITY: Revogar grants anon/PUBLIC desnecessários descobertos por auditoria exaustiva

-- F-01 CRÍTICO: get_identity_matrix() permite exfiltração completa do diretório de usuários via anon key
-- Função SECURITY DEFINER faz JOIN auth.users+profiles+user_roles+permissions sem WHERE nem caller check
REVOKE EXECUTE ON FUNCTION public.get_identity_matrix() FROM anon;

-- F-02 ALTO: get_own_lockout_status() anon callable sem ownership check — enumera lockout de qualquer email
REVOKE EXECUTE ON FUNCTION public.get_own_lockout_status(text) FROM anon;

-- F-03 ALTO: effective_role() anon callable — mapa completo de roles da organização
REVOKE EXECUTE ON FUNCTION public.effective_role(uuid) FROM anon;

-- F-04 ALTO: is_admin() anon callable — oracle binário de admin por UUID
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;

-- F-05 MÉDIO: is_ip_blocked/whitelisted anon callable — expõe config de IP blocklist
REVOKE EXECUTE ON FUNCTION public.is_ip_blocked(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_ip_whitelisted(text) FROM anon;

-- F-06 MÉDIO: is_country_allowed/blocked anon callable — expõe política de geo-blocking
REVOKE EXECUTE ON FUNCTION public.is_country_allowed(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_country_blocked(text) FROM anon;

-- A1-C2: is_account_locked tem PUBLIC execute desnecessário
REVOKE EXECUTE ON FUNCTION public.is_account_locked(text) FROM PUBLIC;

-- F-08 BAIXO: trigger functions com anon EXECUTE desnecessário (violam least-privilege)
REVOKE EXECUTE ON FUNCTION public.audit_role_permissions_changes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_profile_role_from_user_roles() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_thread_last_sender() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_device_last_seen() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_global_settings_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;

-- A1-C9: RLS assimetria em login_attempts — supervisors podem DELETE mas não SELECT
DROP POLICY IF EXISTS "Only admins can view login attempts" ON public.login_attempts;
CREATE POLICY "Admins and supervisors can view login attempts"
  ON public.login_attempts FOR SELECT
  USING (is_admin_or_supervisor(auth.uid()));
