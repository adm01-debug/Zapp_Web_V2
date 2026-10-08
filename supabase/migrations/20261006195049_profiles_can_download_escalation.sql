-- profiles_can_download_escalation
-- Rollback:
--   DROP TRIGGER IF EXISTS prevent_profile_can_download_escalation ON public.profiles;
--   DROP FUNCTION IF EXISTS public.prevent_profile_can_download_escalation();
-- /Rollback
--
-- R2-AUTH-027 (backlog #252): o dono do proprio perfil podia ligar o flag
-- administrativo profiles.can_download por PATCH direto em public.profiles.
-- A policy PERMISSIVE "Users can update own profile" permite UPDATE do proprio
-- perfil (auth.uid() = user_id) e o manifesto mantem GRANT UPDATE de
-- public.profiles para authenticated. A policy restritiva existente preserva
-- role, access_level, permissions e is_active, mas nao cita can_download.
--
-- Para nao gerar drift de policy com nome misto/quoted no verificador, esta
-- migration mantem as policies intactas e adiciona um trigger especifico para
-- can_download. Nao-admin falha fechado; admin/supervisor segue autorizado.

CREATE OR REPLACE FUNCTION public.prevent_profile_can_download_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
  IF OLD.can_download IS DISTINCT FROM NEW.can_download
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators or supervisors can modify can_download';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_profile_can_download_escalation() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS prevent_profile_can_download_escalation ON public.profiles;
CREATE TRIGGER prevent_profile_can_download_escalation
  BEFORE UPDATE OF can_download ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_can_download_escalation();
