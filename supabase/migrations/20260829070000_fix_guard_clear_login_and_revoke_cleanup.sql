-- 20260829070000_fix_guard_clear_login_and_revoke_cleanup
-- Auditoria exaustiva 29/08/2026
--
-- F1: clear_login_attempts -- guard quebrava em contexto sem JWT (pg_cron).
--     coalesce(auth.role(),'') retornava '' em pg_cron, causando RAISE para
--     qualquer email. Fix: coalesce(auth.role(), current_user) resolve para
--     'postgres' em pg_cron, permitindo execucao correta.
--     5 cenarios simulados e validados antes da execucao.
--
-- F3: REVOKE de authenticated em cleanup_expired_challenges e
--     cleanup_link_preview_cache. Funcoes tinham guard interno correto mas
--     ACL ainda concedia EXECUTE a authenticated. Zero call sites no front
--     (types.ts apenas declaracao de tipos -- confirmado via grep).
--     Cron usa role postgres (nao afetado). Guard permanece como defense-in-depth.

CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (coalesce(auth.role(), current_user) IN ('service_role', 'postgres', 'supabase_admin'))
     AND LOWER(p_email) IS DISTINCT FROM LOWER(coalesce(auth.jwt()->>'email', ''))
  THEN
    RAISE EXCEPTION 'clear_login_attempts: so e permitido limpar o proprio email';
  END IF;
  DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_challenges() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_link_preview_cache() FROM authenticated;
