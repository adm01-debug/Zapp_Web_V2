CREATE OR REPLACE FUNCTION public.delete_talkx_template(p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_profile_id uuid;
  v_owner uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  v_profile_id := public.get_profile_id_for_user(v_caller);
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  SELECT created_by INTO v_owner
  FROM public.talkx_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  IF NOT (v_owner = v_profile_id OR public.is_admin_or_supervisor(v_caller)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- N-127b: trava a linha do template ate o fim da transacao antes de conferir
  -- o uso em campanha. Sem ela, EXISTS + DELETE em comandos separados deixam
  -- uma campanha vinculada no meio do caminho (TOCTOU) e a FK SET NULL a orfa.
  PERFORM 1 FROM public.talkx_templates WHERE id = p_template_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.talkx_campaigns WHERE template_id = p_template_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'talkx_template_in_use');
  END IF;

  DELETE FROM public.talkx_templates WHERE id = p_template_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$
