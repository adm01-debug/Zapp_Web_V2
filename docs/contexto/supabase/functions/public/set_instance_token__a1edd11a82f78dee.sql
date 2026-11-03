CREATE OR REPLACE FUNCTION public.set_instance_token(p_connection_id uuid, p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
DECLARE
  v_existing uuid;
  v_secret_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_connection_id IS NULL OR p_token IS NULL OR p_token = '' THEN
    RAISE EXCEPTION 'invalid_instance_token' USING ERRCODE = '22023';
  END IF;

  SELECT instance_token_secret_id INTO v_existing
  FROM public.whatsapp_connections
  WHERE id = p_connection_id;

  IF v_existing IS NULL THEN
    v_secret_id := vault.create_secret(p_token, 'whatsapp_instance_token:' || p_connection_id::text);
    UPDATE public.whatsapp_connections
    SET instance_token_secret_id = v_secret_id
    WHERE id = p_connection_id;
  ELSE
    PERFORM vault.update_secret(v_existing, p_token);
    v_secret_id := v_existing;
  END IF;

  RETURN v_secret_id;
END;
$function$
