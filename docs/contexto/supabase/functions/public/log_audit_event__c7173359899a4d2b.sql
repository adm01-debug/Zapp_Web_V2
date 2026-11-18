CREATE OR REPLACE FUNCTION public.log_audit_event(p_action text, p_entity_type text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text, p_details jsonb DEFAULT NULL::jsonb, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_entity_id_uuid uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Converter p_entity_id (text) para uuid com tratamento de valor invalido.
  -- A coluna audit_logs.entity_id e uuid; passar text diretamente causava
  -- "column entity_id is of type uuid but expression is of type text".
  IF p_entity_id IS NOT NULL AND p_entity_id <> '' THEN
    BEGIN
      v_entity_id_uuid := p_entity_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_entity_id_uuid := NULL;
    END;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details, user_agent)
  VALUES (v_user_id, p_action, p_entity_type, v_entity_id_uuid, p_details, p_user_agent);
END;
$function$
