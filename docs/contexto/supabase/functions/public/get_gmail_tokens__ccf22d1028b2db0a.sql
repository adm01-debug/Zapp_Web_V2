CREATE OR REPLACE FUNCTION public.get_gmail_tokens(p_account_id uuid)
 RETURNS TABLE(access_token text, refresh_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    public.decrypt_gmail_token(a.access_token_encrypted),
    public.decrypt_gmail_token(a.refresh_token_encrypted)
  FROM public.gmail_accounts a
  WHERE a.id = p_account_id;
END;
$function$
