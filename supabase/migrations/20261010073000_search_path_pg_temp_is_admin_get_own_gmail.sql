-- 20261010073000_search_path_pg_temp_is_admin_get_own_gmail
-- Rollback: ALTER FUNCTION public.is_admin_or_supervisor(UUID) SET search_path = public; ALTER FUNCTION public.get_own_gmail_accounts() SET search_path = public;
--
-- Fix: adicionar pg_temp ao search_path de duas funcoes SECURITY DEFINER que
-- consultavam apenas com 'public', deixando-as vulneraveis a manipulacao de
-- search_path via tabelas temporarias (pg_temp). O padrao do repositorio e
-- 'SET search_path = public, pg_temp' (backend-zapp-como-provar).

ALTER FUNCTION public.is_admin_or_supervisor(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_own_gmail_accounts() SET search_path = public, pg_temp;