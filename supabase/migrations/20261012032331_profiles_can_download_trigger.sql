-- profiles_can_download_trigger
-- Rollback: dropa o trigger prevent_can_download_escalation em public.profiles e, em seguida, a funcao.
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists prevent_can_download_escalation on public.profiles;
--   drop function if exists public.prevent_can_download_escalation();
--
-- R2-AUTH-027 (backlog #252): o dono do proprio perfil podia ligar o flag administrativo
-- profiles.can_download por PATCH direto em public.profiles. A policy PERMISSIVE
-- "Users can update own profile" permite o UPDATE do proprio perfil (auth.uid() = user_id),
-- o GRANT UPDATE de public.profiles para authenticated esta no manifesto, e a barreira
-- vigente era a policy RESTRICTIVE "Block sensitive field changes by non-admins"
-- (20260405230710_35b60740-aa0f-437d-9029-f5c0d8e1edf0.sql), que preservava role,
-- access_level, permissions e is_active -- e nao citava can_download. O trigger
-- prevent_profile_privilege_escalation tambem nao cobre o campo.
-- Efeito medido: can_download=true no proprio perfil, depois refetch, e o consumidor
-- (useDownloadPermission -> ImagePreview) libera o download que a tela de admin dizia
-- depender do administrador.
--
-- Correcao: a barreira passa a ser um trigger dedicado ao campo, que levanta excecao
-- quando um NAO-admin/supervisor muda profiles.can_download. Diferente da policy
-- reconstruida na 1a entrega, este caminho nao depende de reconstruir a policy RESTRICTIVE
-- (cujo nome entre aspas no retrato canonico do zapp-verify nao casa com a migration
-- pendente) e vale para qualquer caminho de UPDATE, inclusive fora do PostgREST.
-- Admin e supervisor (is_admin_or_supervisor) seguem liberando o flag de outro usuario,
-- como a tela de admin ja fazia. O UPDATE interno de papel
-- (sync_profile_role_from_user_roles) nao toca can_download, entao nao e afetado.
-- A policy RESTRICTIVE vigente permanece intacta (role/access_level/permissions/is_active).

CREATE OR REPLACE FUNCTION public.prevent_can_download_escalation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_escalada boolean;
BEGIN
  v_escalada := (OLD.can_download IS DISTINCT FROM NEW.can_download);
  IF v_escalada AND NOT is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can change the can_download flag';
  END IF;
  RETURN NEW;
END;
$$;

-- Funcao de trigger nao precisa ser executavel por ninguem: negar por padrao.
REVOKE EXECUTE ON FUNCTION public.prevent_can_download_escalation() FROM PUBLIC;

DROP TRIGGER IF EXISTS prevent_can_download_escalation ON public.profiles;
CREATE TRIGGER prevent_can_download_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_can_download_escalation();
