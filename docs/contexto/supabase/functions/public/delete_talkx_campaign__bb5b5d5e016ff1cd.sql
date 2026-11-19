CREATE OR REPLACE FUNCTION public.delete_talkx_campaign(p_campaign_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
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
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;
  -- X014: excluir campanha é ato de admin/supervisor (a RLS de DELETE também exige).
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Só rascunho ou agendamento sem envio. Campanha em voo/concluída não se apaga.
  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_campaign_not_deletable' USING ERRCODE = '55000';
  END IF;

  -- Fuga transacional lida pelo guard (enforce_talkx_campaign_mutability) para o
  -- ramo DELETE aceitar 'scheduled' sem afrouxar o caminho direto do cliente.
  PERFORM set_config('app.talkx_campaign_delete', 'on', true);
  DELETE FROM public.talkx_campaigns WHERE id = p_campaign_id;

  RETURN p_campaign_id;
END;
$function$
