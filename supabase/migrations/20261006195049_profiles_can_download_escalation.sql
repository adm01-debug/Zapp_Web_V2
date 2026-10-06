-- profiles_can_download_escalation
-- Rollback: DROP POLICY "Block sensitive field changes by non-admins" ON public.profiles; e recriar a policy
--   original SEM a linha do can_download, com o corpo exato de
--   supabase/migrations/20260405230710_35b60740-aa0f-437d-9029-f5c0d8e1edf0.sql.
--
-- R2-AUTH-027 (backlog #252): o dono do proprio perfil podia ligar o flag
-- administrativo profiles.can_download por PATCH direto em public.profiles.
-- A policy PERMISSIVE "Users can update own profile" permite UPDATE do proprio
-- perfil (auth.uid() = user_id) e o manifesto mantem GRANT UPDATE de
-- public.profiles para authenticated. A barreira era a policy RESTRICTIVE
-- "Block sensitive field changes by non-admins"
-- (20260405230710_35b60740-aa0f-437d-9029-f5c0d8e1edf0.sql), que preservava
-- role, access_level, permissions e is_active — e nao citava can_download.
-- O trigger prevent_profile_privilege_escalation tambem nao cobre o campo.
-- Efeito medido: can_download=true no proprio perfil, depois refetch, e o
-- consumidor (useDownloadPermission -> ImagePreview) libera o download que a
-- tela de admin dizia depender do administrador.
--
-- Esta migration reconstroi a MESMA policy restritiva, com o mesmo nome, o
-- mesmo papel e as mesmas condicoes, acrescentando can_download a lista de
-- campos que o nao-admin nao pode alterar. Admin/supervisor seguem passando
-- pelo primeiro ramo (is_admin_or_supervisor).

DROP POLICY IF EXISTS "Block sensitive field changes by non-admins" ON public.profiles;

CREATE POLICY "Block sensitive field changes by non-admins"
ON public.profiles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
WITH CHECK (
  -- Admins/supervisors can change anything
  is_admin_or_supervisor(auth.uid())
  OR
  -- Nao-admin: campos administrativos precisam permanecer intactos
  (
    role = (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
    AND access_level = (SELECT p.access_level FROM public.profiles p WHERE p.user_id = auth.uid())
    AND permissions = (SELECT p.permissions FROM public.profiles p WHERE p.user_id = auth.uid())
    AND is_active = (SELECT p.is_active FROM public.profiles p WHERE p.user_id = auth.uid())
    AND can_download = (SELECT p.can_download FROM public.profiles p WHERE p.user_id = auth.uid())
  )
);
