CREATE OR REPLACE FUNCTION public.talkx_campaign_variant_stats(p_campaign_id uuid)
 RETURNS TABLE(variant_id uuid, label text, weight integer, total bigint, sent bigint, deliveries bigint, reads bigint, replies bigint, clicks bigint, reply_rate numeric, click_rate numeric, delivery_rate numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles AS profile
   WHERE profile.user_id = auth.uid() AND profile.is_active = true
   LIMIT 1;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT v.id, v.label, v.weight,
         count(r.id),
         count(r.id) FILTER (WHERE r.sent_at      IS NOT NULL),
         count(r.id) FILTER (WHERE r.delivered_at IS NOT NULL),
         count(r.id) FILTER (WHERE r.read_at      IS NOT NULL),
         count(r.id) FILTER (WHERE r.replied_at   IS NOT NULL),
         count(r.id) FILTER (WHERE r.clicked_at   IS NOT NULL),
         CASE WHEN count(r.id) > 0 THEN round(count(r.id) FILTER (WHERE r.replied_at   IS NOT NULL)::numeric * 100 / count(r.id), 2) ELSE 0 END,
         CASE WHEN count(r.id) > 0 THEN round(count(r.id) FILTER (WHERE r.clicked_at   IS NOT NULL)::numeric * 100 / count(r.id), 2) ELSE 0 END,
         CASE WHEN count(r.id) > 0 THEN round(count(r.id) FILTER (WHERE r.delivered_at IS NOT NULL)::numeric * 100 / count(r.id), 2) ELSE 0 END
    FROM public.talkx_template_variants AS v
    LEFT JOIN public.talkx_recipients AS r
           ON r.campaign_id = p_campaign_id AND r.variant_id = v.id
   WHERE v.template_id = v_campaign.template_id
   GROUP BY v.id, v.label, v.weight
   ORDER BY v.label;
END;
$function$
