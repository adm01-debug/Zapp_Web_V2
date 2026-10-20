-- 20260828210000_get_own_gmail_accounts_filter_active
--
-- Racional: get_own_gmail_accounts e o fallback do front quando a edge
-- gmail-oauth (action list-accounts) falha. A edge filtra is_active = true,
-- mas a funcao nao filtrava -- entao uma conta desconectada (is_active=false,
-- tokens zerados pelo disconnect) continuava aparecendo como conta ativa no
-- caminho de fallback, levando o modulo a operar sobre uma conta sem tokens.
--
-- Fix: alinhar a funcao ao contrato da edge. Assinatura e ACL intactas.

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
SET search_path TO 'public'
AS $function$
  SELECT id, user_id, email_address, is_active, sync_status,
         last_sync_at, last_error, token_expires_at, created_at, updated_at
  FROM public.gmail_accounts
  WHERE user_id = auth.uid()
    AND is_active = true;
$function$;
