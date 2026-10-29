-- user_sessions_expire_diario
-- Rollback: DO $$ BEGIN IF to_regclass('cron.job') IS NOT NULL THEN PERFORM cron.unschedule('user-sessions-expire-diario'); END IF; END $$; DROP FUNCTION IF EXISTS public.expire_user_sessions();
-- Espelho executavel do rollback, por comando (mesmo SQL da linha 2):
--   DO $$ BEGIN IF to_regclass('cron.job') IS NOT NULL THEN PERFORM cron.unschedule('user-sessions-expire-diario'); END IF; END $$;
--   drop function if exists public.expire_user_sessions();
-- Remove a funcao expire_user_sessions e o job do pg_cron (tolerando banco sem pg_cron).

-- N-008: sessoes com expires_at vencido continuavam is_active=true e confundiam quem esta online.
-- Rotina diaria encerra as vencidas (is_active=false, ended_at preenchido). So service_role/cron executam.
CREATE OR REPLACE FUNCTION public.expire_user_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.user_sessions
     SET is_active = false,
         ended_at = COALESCE(ended_at, now())
   WHERE is_active IS TRUE
     AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_user_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_user_sessions() TO service_role;

DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'user-sessions-expire-diario') THEN
      PERFORM cron.unschedule('user-sessions-expire-diario');
    END IF;
    PERFORM cron.schedule('user-sessions-expire-diario', '17 3 * * *', 'select public.expire_user_sessions()');
  END IF;
END
$$;
