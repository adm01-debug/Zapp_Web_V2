CREATE OR REPLACE FUNCTION public.set_department_whatsapp_config(p_department_id uuid, p_whatsapp_mode text, p_api_key text DEFAULT NULL::text, p_instance_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Ator da auditoria (nao e decisao de autorizacao: quem autoriza e public.is_admin_or_supervisor).
  v_profile_id   uuid := public.current_profile_id();
  -- Estado ARMAZENADO depois do UPDATE (nao o parametro recebido).
  v_has_api_key  boolean;
BEGIN
  -- Guarda canonica: a MESMA da leitura e a mesma fonte (public.user_roles via
  -- is_admin_or_supervisor). profiles.role nao autoriza nada aqui.
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  IF p_whatsapp_mode NOT IN ('none','evolution','official') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_mode');
  END IF;

  UPDATE public.departments
  SET
    whatsapp_mode        = p_whatsapp_mode,
    whatsapp_api_key     = COALESCE(p_api_key, whatsapp_api_key),
    whatsapp_instance_id = COALESCE(p_instance_id, whatsapp_instance_id),
    updated_at           = now()
  WHERE id = p_department_id
  RETURNING (NULLIF(whatsapp_api_key, '') IS NOT NULL) INTO v_has_api_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'department_not_found');
  END IF;

  -- Auditoria sem a chave: guarda o modo e se existe chave ARMAZENADA, nunca o segredo.
  INSERT INTO public.department_audit_logs(department_id, action, profile_id, details)
  VALUES (
    p_department_id,
    'whatsapp_updated',
    v_profile_id,
    jsonb_build_object('mode', p_whatsapp_mode, 'has_api_key', COALESCE(v_has_api_key, false))
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$
