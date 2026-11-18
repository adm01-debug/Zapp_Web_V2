CREATE OR REPLACE FUNCTION public.decide_talkx_ab_winner(p_campaign_id uuid, p_variant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_metric text; v_min integer;
  v_primeira record; v_segunda record;
  v_erro_padrao numeric; v_diferenca numeric;
  v_menor_amostra bigint; v_variantes integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  SELECT profile.id INTO v_actor_profile_id FROM public.profiles AS profile
   WHERE profile.user_id = auth.uid() AND profile.is_active = true LIMIT 1;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(v_campaign.ab_enabled, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_ab_not_enabled' USING ERRCODE = '22023';
  END IF;
  v_metric := COALESCE(v_campaign.ab_metric, 'reply_rate');
  v_min    := COALESCE(v_campaign.ab_min_sample, 50);

  SELECT count(*)::integer, COALESCE(min(s.total), 0) INTO v_variantes, v_menor_amostra
    FROM public.talkx_campaign_variant_stats(p_campaign_id) AS s;
  IF v_variantes < 2 THEN
    RETURN jsonb_build_object('status','insufficient_data','reason','less_than_two_variants','variants',v_variantes);
  END IF;

  IF p_variant_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.talkx_campaign_variant_stats(p_campaign_id) AS s WHERE s.variant_id = p_variant_id) THEN
      RAISE EXCEPTION 'talkx_ab_variant_not_in_campaign' USING ERRCODE = '22023';
    END IF;
    UPDATE public.talkx_campaigns
       SET ab_winner_variant_id = p_variant_id, ab_winner_decided_at = statement_timestamp(),
           ab_winner_decided_by = v_actor_profile_id, updated_at = statement_timestamp()
     WHERE id = p_campaign_id;
    INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
    VALUES (p_campaign_id, 'ab_winner_decided', v_actor_profile_id,
            jsonb_build_object('mode','manual','variant_id',p_variant_id,'metric',v_metric)::text);
    RETURN jsonb_build_object('status','decided','mode','manual','variant_id',p_variant_id,'metric',v_metric);
  END IF;

  IF v_menor_amostra < v_min THEN
    RETURN jsonb_build_object('status','insufficient_data','reason','min_sample','min_sample',v_min,'smallest_variant_sample',v_menor_amostra);
  END IF;

  SELECT s.variant_id, s.label, s.total,
         (CASE v_metric WHEN 'click_rate' THEN s.clicks WHEN 'delivery_rate' THEN s.deliveries ELSE s.replies END)::numeric / NULLIF(s.total,0) AS taxa
    INTO v_primeira FROM public.talkx_campaign_variant_stats(p_campaign_id) AS s
   ORDER BY (CASE v_metric WHEN 'click_rate' THEN s.clicks WHEN 'delivery_rate' THEN s.deliveries ELSE s.replies END)::numeric / NULLIF(s.total,0) DESC NULLS LAST, s.label LIMIT 1;
  SELECT s.variant_id, s.label, s.total,
         (CASE v_metric WHEN 'click_rate' THEN s.clicks WHEN 'delivery_rate' THEN s.deliveries ELSE s.replies END)::numeric / NULLIF(s.total,0) AS taxa
    INTO v_segunda FROM public.talkx_campaign_variant_stats(p_campaign_id) AS s
   WHERE s.variant_id <> v_primeira.variant_id
   ORDER BY (CASE v_metric WHEN 'click_rate' THEN s.clicks WHEN 'delivery_rate' THEN s.deliveries ELSE s.replies END)::numeric / NULLIF(s.total,0) DESC NULLS LAST, s.label LIMIT 1;

  v_erro_padrao := sqrt((v_primeira.taxa * (1 - v_primeira.taxa)) / v_primeira.total
                      + (v_segunda.taxa  * (1 - v_segunda.taxa))  / v_segunda.total);
  v_diferenca := v_primeira.taxa - v_segunda.taxa;

  IF v_erro_padrao IS NULL OR v_diferenca <= 0 OR v_diferenca < 2 * v_erro_padrao THEN
    RETURN jsonb_build_object('status','insufficient_data','reason','difference_within_noise','metric',v_metric,
      'leader_rate', round(COALESCE(v_primeira.taxa,0)*100,2),
      'runner_up_rate', round(COALESCE(v_segunda.taxa,0)*100,2),
      'required_difference', round(COALESCE(2*v_erro_padrao,0)*100,2));
  END IF;

  UPDATE public.talkx_campaigns
     SET ab_winner_variant_id = v_primeira.variant_id, ab_winner_decided_at = statement_timestamp(),
         ab_winner_decided_by = v_actor_profile_id, updated_at = statement_timestamp()
   WHERE id = p_campaign_id;
  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
  VALUES (p_campaign_id, 'ab_winner_decided', v_actor_profile_id,
          jsonb_build_object('mode','automatic','variant_id',v_primeira.variant_id,'metric',v_metric,
            'leader_rate', round(v_primeira.taxa*100,2), 'runner_up_rate', round(v_segunda.taxa*100,2))::text);
  RETURN jsonb_build_object('status','decided','mode','automatic','variant_id',v_primeira.variant_id,'metric',v_metric,
    'leader_rate', round(v_primeira.taxa*100,2), 'runner_up_rate', round(v_segunda.taxa*100,2));
END;
$function$
