CREATE OR REPLACE FUNCTION public.remove_contact_tag(p_contact_id uuid, p_tag text)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_tag  text;
  v_tags text[];
BEGIN
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  PERFORM public.require_contact_edit_permission(p_contact_id);

  v_tag := btrim(COALESCE(p_tag, ''));
  IF v_tag = '' THEN
    RAISE EXCEPTION 'contact_tag_empty' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_tag) > 40 THEN
    RAISE EXCEPTION 'contact_tag_too_long' USING ERRCODE = '22023';
  END IF;

  UPDATE public.contacts AS c
     SET tags = ARRAY(
           SELECT t.existing
           FROM unnest(COALESCE(c.tags, '{}'::text[])) AS t(existing)
           WHERE lower(t.existing) <> lower(v_tag)
         ),
         updated_at = now()
   WHERE c.id = p_contact_id
     AND EXISTS (
       SELECT 1
       FROM unnest(COALESCE(c.tags, '{}'::text[])) AS t(existing)
       WHERE lower(t.existing) = lower(v_tag)
     )
  RETURNING c.tags INTO v_tags;

  IF v_tags IS NULL THEN
    SELECT COALESCE(c.tags, '{}'::text[]) INTO v_tags
    FROM public.contacts AS c
    WHERE c.id = p_contact_id;
    RETURN v_tags;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, details)
  VALUES (
    'contact_tag_removed', 'contact', p_contact_id, auth.uid(),
    jsonb_build_object('tag', v_tag)
  );

  RETURN v_tags;
END;
$function$
