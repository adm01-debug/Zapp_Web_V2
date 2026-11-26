CREATE OR REPLACE FUNCTION public.duplicate_talkx_template(p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_profile_id uuid;
  v_src public.talkx_templates%ROWTYPE;
  v_new_id uuid;
  v_new_name text;
  v_variants integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  v_profile_id := public.get_profile_id_for_user(v_caller);
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  SELECT * INTO v_src FROM public.talkx_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  -- N-127b: a RPC e SECURITY DEFINER e nao herda a RLS. So o dono do template de
  -- origem ou admin/supervisor pode duplicar; os demais nao copiam conteudo alheio.
  IF NOT (v_src.created_by = v_profile_id OR public.is_admin_or_supervisor(v_caller)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- ' (cópia)' tem 8 caracteres; o CHECK da tabela limita name a 200.
  v_new_name := left(v_src.name, 192) || ' (cópia)';

  INSERT INTO public.talkx_templates (
    name, description, category, content, media_url, media_type, tags,
    status, custom_variables, created_by
  ) VALUES (
    v_new_name, v_src.description, v_src.category, v_src.content,
    v_src.media_url, v_src.media_type, v_src.tags,
    'draft', v_src.custom_variables, v_profile_id
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.talkx_template_variants (
    template_id, label, content, media_url, media_type, weight
  )
  SELECT v_new_id, label, content, media_url, media_type, weight
  FROM public.talkx_template_variants
  WHERE template_id = p_template_id;
  GET DIAGNOSTICS v_variants = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'template_id', v_new_id,
    'variants_copied', v_variants
  );
END;
$function$
