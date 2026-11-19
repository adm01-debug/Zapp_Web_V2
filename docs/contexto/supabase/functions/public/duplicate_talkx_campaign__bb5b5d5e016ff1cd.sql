CREATE OR REPLACE FUNCTION public.duplicate_talkx_campaign(p_campaign_id uuid)
 RETURNS talkx_campaigns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_source public.talkx_campaigns%ROWTYPE;
  v_new public.talkx_campaigns%ROWTYPE;
  v_now timestamptz := statement_timestamp();
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;
  -- X014: criar rascunho é ato de admin/supervisor (a RLS de INSERT também exige).
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_source
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_source.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Copia configuração (mensagem, mídia, segmento, limites e janela). NÃO copia
  -- destinatários (total_recipients=0), agendamento (scheduled_at nulo), estado de
  -- entrega nem autoria: o novo rascunho pertence a quem duplicou.
  INSERT INTO public.talkx_campaigns (
    name, message_template, description, objective, audience_source,
    audience_filters, segment_id, template_id, template_version_id,
    whatsapp_connection_id, media_url, media_type, schedule_timezone,
    send_window_start, send_window_end, business_hours_only, speed_profile,
    typing_delay_min, typing_delay_max, send_interval_min, send_interval_max,
    respect_suppression, confirm_consent, draft_step, owner, responsible_id,
    status, created_by, draft_creation_key, revision, created_at, updated_at
  ) VALUES (
    left(v_source.name || ' (cópia)', 200), v_source.message_template, v_source.description,
    v_source.objective, v_source.audience_source, v_source.audience_filters,
    v_source.segment_id, v_source.template_id, v_source.template_version_id,
    v_source.whatsapp_connection_id, v_source.media_url, v_source.media_type,
    v_source.schedule_timezone, v_source.send_window_start, v_source.send_window_end,
    v_source.business_hours_only, v_source.speed_profile, v_source.typing_delay_min,
    v_source.typing_delay_max, v_source.send_interval_min, v_source.send_interval_max,
    v_source.respect_suppression, v_source.confirm_consent, v_source.draft_step,
    v_actor_profile_id, v_actor_profile_id,
    'draft', v_actor_profile_id, gen_random_uuid(), 1, v_now, v_now
  )
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$function$
