CREATE OR REPLACE FUNCTION public.talkx_upsert_link(p_campaign_id uuid, p_label text, p_target_url text, p_link_id uuid DEFAULT NULL::uuid, p_utm_source text DEFAULT NULL::text, p_utm_medium text DEFAULT NULL::text, p_utm_campaign text DEFAULT NULL::text, p_utm_content text DEFAULT NULL::text, p_utm_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor     uuid;
  v_campaign  public.talkx_campaigns%ROWTYPE;
  v_link_id   uuid;
  v_slug      text;
  v_event     text;
BEGIN
  v_actor := (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1);

  IF NOT COALESCE(public.is_admin_or_supervisor(auth.uid()), false) THEN
    RAISE EXCEPTION 'talkx_link_not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_link_campaign_not_found' USING ERRCODE = '23503';
  END IF;
  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_link_campaign_not_editable' USING ERRCODE = '22023';
  END IF;

  IF p_label !~ '^[a-z0-9][a-z0-9_-]{0,39}$' THEN
    RAISE EXCEPTION 'talkx_link_invalid_label' USING ERRCODE = '22023';
  END IF;
  IF p_target_url !~ '^https://' THEN
    RAISE EXCEPTION 'talkx_link_invalid_target' USING ERRCODE = '22023';
  END IF;

  IF p_link_id IS NOT NULL THEN
    UPDATE public.talkx_links
       SET label        = p_label,
           target_url   = p_target_url,
           utm_source   = p_utm_source,
           utm_medium   = p_utm_medium,
           utm_campaign = p_utm_campaign,
           utm_content  = p_utm_content,
           utm_term     = p_utm_term
     WHERE id = p_link_id AND campaign_id = p_campaign_id
     RETURNING id INTO v_link_id;
    IF v_link_id IS NULL THEN
      RAISE EXCEPTION 'talkx_link_not_found' USING ERRCODE = '23503';
    END IF;
    v_event := 'link_updated';
  ELSE
    v_slug := substr(md5(gen_random_uuid()::text), 1, 10);
    INSERT INTO public.talkx_links (campaign_id, label, target_url, slug, created_by,
                                    utm_source, utm_medium, utm_campaign, utm_content, utm_term)
    VALUES (p_campaign_id, p_label, p_target_url, v_slug, v_actor,
            p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term)
    RETURNING id INTO v_link_id;
    v_event := 'link_created';
  END IF;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
  VALUES (p_campaign_id, v_event, v_actor, p_label);

  RETURN jsonb_build_object(
    'id',    v_link_id,
    'slug',  (SELECT slug FROM public.talkx_links WHERE id = v_link_id),
    'event', v_event
  );
END;
$function$
