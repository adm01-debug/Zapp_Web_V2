CREATE OR REPLACE FUNCTION public.get_instance_token(p_instance_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
DECLARE
  v_secret_id uuid;
  v_token text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT instance_token_secret_id INTO v_secret_id
  FROM public.whatsapp_connections
  WHERE instance_id = p_instance_id;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;

  RETURN v_token;
END;
$function$
