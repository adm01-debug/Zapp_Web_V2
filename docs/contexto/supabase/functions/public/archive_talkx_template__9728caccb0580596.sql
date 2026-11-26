CREATE OR REPLACE FUNCTION public.archive_talkx_template(p_template_id uuid, p_archived boolean DEFAULT true)
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

  -- Idempotente: so grava se o estado muda (nao reescreve updated_at a toa).
  UPDATE public.talkx_templates
     SET archived_at = CASE WHEN p_archived THEN now() ELSE NULL END
   WHERE id = p_template_id
     AND (archived_at IS NULL) = p_archived;

  RETURN jsonb_build_object('ok', true, 'archived', p_archived);
END;
$function$
