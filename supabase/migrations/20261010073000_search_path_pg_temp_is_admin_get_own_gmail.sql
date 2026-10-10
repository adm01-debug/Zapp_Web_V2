-- 20261010073000_search_path_pg_temp_is_admin_get_own_gmail
-- Rollback: remover pg_temp do search_path de ambas as funcoes, restaurando o estado anterior (SET search_path = public / SET search_path TO 'public').
--
-- Fix: adicionar pg_temp ao search_path de duas funcoes SECURITY DEFINER que
-- consultavam apenas com 'public', deixando-as vulneraveis a manipulacao de
-- search_path via tabelas temporarias (pg_temp). O padrao do repositorio e
-- 'SET search_path = public, pg_temp' (backend-zapp-como-provar).

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;

CREATE OR REPLACE FUNCTION public.get_own_gmail_accounts()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  email_address text,
  is_active boolean,
  sync_status text,
  last_sync_at timestamptz,
  last_error text,
  token_expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', pg_temp
AS $function$
  SELECT id, user_id, email_address, is_active, sync_status,
         last_sync_at, last_error, token_expires_at, created_at, updated_at
  FROM public.gmail_accounts
  WHERE user_id = auth.uid()
    AND is_active = true;
$function$;