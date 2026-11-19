CREATE OR REPLACE FUNCTION public.store_gmail_tokens(p_account_id uuid, p_access_token text, p_refresh_token text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_access_token IS NULL OR p_access_token = '' THEN
    RAISE EXCEPTION 'store_gmail_tokens: p_access_token vazio para conta %', p_account_id;
  END IF;

  UPDATE public.gmail_accounts
  SET access_token_encrypted = public.encrypt_gmail_token(p_access_token),
      refresh_token_encrypted = CASE
        WHEN p_refresh_token IS NULL OR p_refresh_token = ''
        THEN refresh_token_encrypted  -- preserva: Google nao reenviou o refresh
        ELSE public.encrypt_gmail_token(p_refresh_token)
      END,
      updated_at = now()
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_gmail_tokens: conta % nao encontrada', p_account_id;
  END IF;
END;
$function$
