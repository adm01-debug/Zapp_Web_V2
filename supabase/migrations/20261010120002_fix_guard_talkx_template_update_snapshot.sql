-- Fix guarda de snapshot: statement_timestamp() muda entre chamadas da mesma
-- transacao, rejeitando o segundo UPDATE do template. transaction_timestamp()
-- e constante dentro da transacao, permitindo que o segundo UPDATE encontre
-- o snapshot criado pela primeira chamada.
--
-- Trocamos statement_timestamp() por transaction_timestamp() em dois lugares:
-- 1) a atribuicao de v_updated_at em update_talkx_template_with_snapshot
--    (o snapshot e o updated_at do template usam o mesmo instante);
-- 2) a comparacao da guarda em guard_talkx_template_update()
--    (o segundo UPDATE encontra o snapshot criado pelo primeiro).
--
-- Rollback: reverter transaction_timestamp() para statement_timestamp() nos
-- dois locais e recriar ambas as funcoes com o corpo anterior.
-- Rollback (SQL executavel, na ordem):
--   CREATE OR REPLACE FUNCTION public.update_talkx_template_with_snapshot(...)
--   ... v_updated_at timestamptz := statement_timestamp(); ... (corpo completo);
--   CREATE OR REPLACE FUNCTION public.guard_talkx_template_update()
--   ... AND history.created_at = statement_timestamp() ... (corpo completo);
CREATE OR REPLACE FUNCTION public.update_talkx_template_with_snapshot(
  p_template_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_description text,
  p_category text,
  p_content text,
  p_media_url text,
  p_media_type text,
  p_tags text[],
  p_status text,
  p_custom_variables text[]
) RETURNS TABLE(template_id uuid, updated_at timestamptz, version_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_template public.talkx_templates%ROWTYPE;
  v_version_number integer;
  v_updated_at timestamptz := transaction_timestamp();
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := public.get_profile_id_for_user(auth.uid());
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'authenticated_profile_not_found' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_template
  FROM public.talkx_templates template
  WHERE template.id = p_template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_template_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_template.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_template_not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_expected_updated_at IS NULL
     OR v_template.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'talkx_template_stale_version' USING ERRCODE = '40001';
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200
     OR p_category IS NULL OR length(btrim(p_category)) NOT BETWEEN 1 AND 100
     OR p_content IS NULL OR length(p_content) NOT BETWEEN 1 AND 65536
     OR p_status IS NULL
     OR p_status NOT IN ('draft', 'review', 'approved')
     OR (p_description IS NOT NULL AND length(p_description) > 4000)
     OR (p_media_url IS NOT NULL AND (
       length(p_media_url) > 8192 OR p_media_url !~ '^https://'
     ))
     OR (p_media_type IS NOT NULL AND p_media_type NOT IN ('image', 'video', 'document', 'audio'))
     OR COALESCE(cardinality(p_tags), 0) > 50
     OR EXISTS (
       SELECT 1 FROM unnest(COALESCE(p_tags, '{}'::text[])) tag
       WHERE length(tag) NOT BETWEEN 1 AND 64
     )
     OR COALESCE(cardinality(p_custom_variables), 0) > 100
     OR EXISTS (
       SELECT 1 FROM unnest(COALESCE(p_custom_variables, '{}'::text[])) variable
       WHERE variable !~ '^[A-Za-z_][A-Za-z0-9_]{0,63}$'
     )
     OR cardinality(ARRAY(SELECT DISTINCT value FROM unnest(COALESCE(p_custom_variables, '{}'::text[])) value))
        IS DISTINCT FROM cardinality(COALESCE(p_custom_variables, '{}'::text[])) THEN
    RAISE EXCEPTION 'invalid_talkx_template' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(history.version_number), 0) + 1
  INTO v_version_number
  FROM public.talkx_template_versions history
  WHERE history.template_id = p_template_id;

  INSERT INTO public.talkx_template_versions (
    template_id, version_number, name, description, content, category, status,
    media_url, media_type, tags, custom_variables, saved_by, created_at
  ) VALUES (
    v_template.id, v_version_number, v_template.name, v_template.description,
    v_template.content, v_template.category, v_template.status, v_template.media_url,
    v_template.media_type, COALESCE(v_template.tags, '{}'::text[]),
    COALESCE(v_template.custom_variables, '{}'::text[]),
    v_actor_profile_id, v_updated_at
  );

  UPDATE public.talkx_templates template
  SET name = btrim(p_name),
      description = p_description,
      category = btrim(p_category),
      content = p_content,
      media_url = p_media_url,
      media_type = p_media_type,
      tags = COALESCE(p_tags, '{}'::text[]),
      status = p_status,
      custom_variables = COALESCE(p_custom_variables, '{}'::text[]),
      updated_at = v_updated_at
  WHERE template.id = p_template_id
  -- The pre-existing updated_at trigger may use transaction_timestamp().
  -- Return the value actually persisted, never the pre-trigger candidate.
  RETURNING template.updated_at INTO v_updated_at;

  RETURN QUERY SELECT p_template_id, v_updated_at, v_version_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_talkx_template_with_snapshot(
  uuid, timestamptz, text, text, text, text, text, text, text[], text, text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_talkx_template_with_snapshot(
  uuid, timestamptz, text, text, text, text, text, text, text[], text, text[]
) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_talkx_template_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user = 'service_role'::name THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.category IS NOT DISTINCT FROM OLD.category
     AND NEW.content IS NOT DISTINCT FROM OLD.content
     AND NEW.media_url IS NOT DISTINCT FROM OLD.media_url
     AND NEW.media_type IS NOT DISTINCT FROM OLD.media_type
     AND NEW.tags IS NOT DISTINCT FROM OLD.tags
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.custom_variables IS NOT DISTINCT FROM OLD.custom_variables
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
     AND NEW.use_count = OLD.use_count + 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.use_count IS NOT DISTINCT FROM OLD.use_count
     AND EXISTS (
       SELECT 1
       FROM public.talkx_template_versions AS history
       WHERE history.template_id = OLD.id
         AND history.created_at = transaction_timestamp()
         AND history.saved_by = public.get_profile_id_for_user(auth.uid())
         AND history.name IS NOT DISTINCT FROM OLD.name
         AND history.description IS NOT DISTINCT FROM OLD.description
         AND history.category IS NOT DISTINCT FROM OLD.category
         AND history.content IS NOT DISTINCT FROM OLD.content
         AND history.media_url IS NOT DISTINCT FROM OLD.media_url
         AND history.media_type IS NOT DISTINCT FROM OLD.media_type
         AND history.tags IS NOT DISTINCT FROM OLD.tags
         AND history.status IS NOT DISTINCT FROM OLD.status
         AND history.custom_variables IS NOT DISTINCT FROM OLD.custom_variables
     ) THEN
    NEW.name := OLD.name;
    NEW.description := OLD.description;
    NEW.category := OLD.category;
    NEW.content := OLD.content;
    NEW.media_url := OLD.media_url;
    NEW.media_type := OLD.media_type;
    NEW.tags := OLD.tags;
    NEW.status := OLD.status;
    NEW.custom_variables := OLD.custom_variables;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_talkx_template_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_talkx_template_update() TO service_role;
