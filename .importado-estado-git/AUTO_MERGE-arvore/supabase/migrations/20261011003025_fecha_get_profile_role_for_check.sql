-- fecha_get_profile_role_for_check
-- Rollback: recria public.get_profile_role_for_check com o corpo anterior (sem a checagem de dono),
-- restrito a este arquivo — a versão vigente volta a expor role/access_level/permissions de terceiros.
-- Rollback (SQL executável, na ordem):
--   create or replace function public.get_profile_role_for_check(p_user_id uuid) returns table(role text, access_level text, permissions jsonb) language sql stable security definer set search_path = public as $$ select p.role, p.access_level, p.permissions from profiles p where p.user_id = p_user_id limit 1; $$;
--
-- SEC-DEFINER_GRANTS_STORAGE-03 (P2, docs/audits/SEGURANCA_DEFINER_GRANTS_STORAGE_2026-10-07.md):
-- A funcao public.get_profile_role_for_check e SECURITY DEFINER e tinha EXECUTE para authenticated, mas o
-- WHERE nao conferia quem chamava: qualquer usuario autenticado lia role/access_level/permissions de
-- QUALQUER OUTRO usuario via PostgREST (rpc/get_profile_role_for_check), reconhecimento direto para
-- escalada de privilegio. A funcao existe apenas para as policies de public.profiles (20260401003034:27-29),
-- cujo uso interno ja passa auth.uid() — a checagem abaixo nao quebra esse caminho.
--
-- Correcao minima: acrescenta ao WHERE que o alvo so e visivel para o proprio dono (p_user_id = auth.uid())
-- ou para admin/supervisor (public.is_admin_or_supervisor(auth.uid())). Nenhum GRANT, papel, policy ou
-- assinatura muda.
CREATE OR REPLACE FUNCTION public.get_profile_role_for_check(p_user_id uuid)
RETURNS TABLE(role text, access_level text, permissions jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role, p.access_level, p.permissions
  FROM profiles p
  WHERE p.user_id = p_user_id
    AND (p_user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))
  LIMIT 1;
$$;
