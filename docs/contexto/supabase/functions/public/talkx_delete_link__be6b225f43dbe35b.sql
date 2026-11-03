CREATE OR REPLACE FUNCTION public.talkx_delete_link(p_link_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor     uuid;
  v_link      public.talkx_links%ROWTYPE;
  v_campaign  public.talkx_campaigns%ROWTYPE;
  v_clicks    bigint;
BEGIN
  v_actor := (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1);

  IF NOT COALESCE(public.is_admin_or_supervisor(auth.uid()), false) THEN
    RAISE EXCEPTION 'talkx_link_not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_link FROM public.talkx_links WHERE id = p_link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_link_not_found' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = v_link.campaign_id;
  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_link_campaign_not_editable' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_clicks FROM public.talkx_link_clicks WHERE link_id = p_link_id;
  IF v_clicks > 0 THEN
    RAISE EXCEPTION 'talkx_link_has_clicks' USING ERRCODE = '55000';
  END IF;

  DELETE FROM public.talkx_links WHERE id = p_link_id;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
  VALUES (v_link.campaign_id, 'link_deleted', v_actor, v_link.label);

  RETURN jsonb_build_object('id', p_link_id, 'deleted', true);
END;
$function$
