CREATE OR REPLACE FUNCTION public.record_talkx_link_click(p_slug text, p_recipient uuid DEFAULT NULL::uuid, p_ua text DEFAULT NULL::text, p_ip_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_link               public.talkx_links%ROWTYPE;
  v_click_id            uuid;
  v_recipient_campaign  uuid;
BEGIN
  SELECT * INTO v_link FROM public.talkx_links WHERE lower(slug) = lower(p_slug);
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'link_not_found'); END IF;

  IF p_recipient IS NOT NULL THEN
    SELECT campaign_id INTO v_recipient_campaign
    FROM public.talkx_recipients WHERE id = p_recipient;
    IF v_recipient_campaign IS NULL OR v_recipient_campaign <> v_link.campaign_id THEN
      p_recipient := NULL;
    END IF;
  END IF;

  INSERT INTO public.talkx_link_clicks(link_id, recipient_id, ua, ip_hash)
  VALUES (v_link.id, p_recipient, p_ua, p_ip_hash)
  RETURNING id INTO v_click_id;

  IF p_recipient IS NOT NULL THEN
    UPDATE public.talkx_recipients
       SET clicked_at  = COALESCE(clicked_at, now()),
           click_count = click_count + 1
     WHERE id = p_recipient;
  END IF;

  RETURN jsonb_build_object(
    'click_id',    v_click_id,
    'link_id',     v_link.id,
    'target_url',  v_link.target_url,
    'campaign_id', v_link.campaign_id
  );
END;
$function$
