-- 20261010073000_search_path_pg_temp_is_admin_get_own_gmail
-- Rollback: recria as funcoes com search_path = public original
--   create or replace function public.is_admin_or_supervisor(_user_id uuid) returns boolean language sql stable security definer set search_path = public as $$
--     SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
--   $function$;
--   create or replace function public.get_own_gmail_accounts() returns table(id uuid, user_id uuid, email_address text, is_active boolean, sync_status text, last_sync_at timestamptz, last_error text, token_expires_at timestamptz, created_at timestamptz, updated_at timestamptz) language sql stable security definer set search_path = public as $$
--     SELECT id, user_id, email_address, is_active, sync_status, last_sync_at, last_error, token_expires_at, created_at, updated_at FROM public.gmail_accounts WHERE user_id = auth.uid() AND is_active = true;
--   $function$;
-- Fix: adicionar pg_temp ao search_path de duas funcoes SECURITY DEFINER que
-- consultavam apenas com 'public', deixando-as vulneraveis a manipulacao de
-- search_path via tabelas temporarias (pg_temp). O padrao do repositorio e
-- 'SET search_path = public, pg_temp' (backend-zapp-como-provar).

ALTER FUNCTION public.is_admin_or_supervisor(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_own_gmail_accounts() SET search_path = public, pg_temp;