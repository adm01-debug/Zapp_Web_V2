CREATE OR REPLACE FUNCTION public.get_own_gmail_accounts()
 RETURNS TABLE(id uuid, user_id uuid, email_address text, is_active boolean, sync_status text, last_sync_at timestamp with time zone, last_error text, token_expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT id, user_id, email_address, is_active, sync_status,
         last_sync_at, last_error, token_expires_at, created_at, updated_at
  FROM public.gmail_accounts
  WHERE user_id = auth.uid()
    AND is_active = true;
$function$
