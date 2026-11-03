CREATE OR REPLACE FUNCTION public.save_talkx_template(p_template_id uuid, p_expected_updated_at timestamp with time zone, p_name text, p_content text, p_category text, p_status text, p_media_url text, p_media_type text, p_tags text[], p_custom_variables text[], p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_template public.talkx_templates%ROWTYPE;
  v_current_updated_at timestamptz;
  v_version_number integer;
  v_version_id uuid;
  v_actor_profile_id uuid;
  v_saved_at timestamptz := statement_timestamp();
BEGIN
  -- Somente usuario autenticado com perfil ativo (nega por padrao).
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := public.get_profile_id_for_user(auth.uid());
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'authenticated_profile_not_found' USING ERRCODE = '42501';
  END IF;

  -- Optimistic locking: trava a linha e confere a versao esperada.
  SELECT * INTO v_template
  FROM public.talkx_templates
  WHERE id = p_template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_template_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_current_updated_at := v_template.updated_at;
  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'optimistic_lock_failed' USING ERRCODE = '40001';
  END IF;

  -- version_number = MAX + 1 desta linha.
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
  FROM public.talkx_template_versions
  WHERE template_id = p_template_id;

  -- Historico recebe o estado anterior (exigencia do guard canonico) + a nota.
  INSERT INTO public.talkx_template_versions (
    template_id, version_number, name, description, content, category, status,
    media_url, media_type, tags, custom_variables, saved_by, created_at, note
  ) VALUES (
    p_template_id, v_version_number, v_template.name, v_template.description,
    v_template.content, v_template.category, v_template.status,
    v_template.media_url, v_template.media_type, v_template.tags,
    v_template.custom_variables, v_actor_profile_id, v_saved_at, p_note
  )
  RETURNING id INTO v_version_id;

  -- Linha viva recebe o conteudo salvo.
  UPDATE public.talkx_templates
  SET name = p_name,
      content = p_content,
      category = p_category,
      status = p_status,
      media_url = p_media_url,
      media_type = p_media_type,
      tags = COALESCE(p_tags, '{}'),
      custom_variables = COALESCE(p_custom_variables, '{}'),
      updated_at = now()
  WHERE id = p_template_id;

  RETURN v_version_id;
END;
$function$
