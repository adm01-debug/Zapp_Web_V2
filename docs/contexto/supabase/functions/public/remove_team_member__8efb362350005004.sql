CREATE OR REPLACE FUNCTION public.remove_team_member(p_conversation_id uuid, p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id    uuid := public.current_profile_id();
  v_conv        RECORD;
  v_actor_role  text;
  v_target_role text;
  v_total_count int;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_actor_id = p_profile_id THEN RAISE EXCEPTION 'cannot_remove_self'; END IF;

  SELECT id, type, created_by INTO v_conv
  FROM public.team_conversations WHERE id = p_conversation_id FOR UPDATE;
  IF v_conv.id IS NULL THEN RAISE EXCEPTION 'conversation_not_found'; END IF;
  IF v_conv.type NOT IN ('group','department') THEN RAISE EXCEPTION 'not_a_group_conversation'; END IF;

  SELECT tcm.member_role INTO v_actor_role
  FROM public.team_conversation_members tcm
  WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id = v_actor_id;
  IF v_actor_role IS NULL THEN RAISE EXCEPTION 'actor_not_a_member'; END IF;

  IF v_actor_role <> 'owner' AND v_conv.created_by <> v_actor_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT tcm.member_role INTO v_target_role
  FROM public.team_conversation_members tcm
  WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id = p_profile_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'target_not_a_member'; END IF;

  IF v_actor_role <> 'owner' AND v_target_role = 'owner' THEN
    RAISE EXCEPTION 'cannot_remove_owner';
  END IF;

  DELETE FROM public.team_conversation_members
  WHERE conversation_id = p_conversation_id AND profile_id = p_profile_id;

  SELECT COUNT(*) INTO v_total_count
  FROM public.team_conversation_members WHERE conversation_id = p_conversation_id;

  IF v_total_count = 0 THEN
    DELETE FROM public.team_conversations WHERE id = p_conversation_id;
    RETURN jsonb_build_object('ok',true,'removed',true,'group_deleted',true,'conversation_id',p_conversation_id,'profile_id',p_profile_id);
  END IF;

  RETURN jsonb_build_object('ok',true,'removed',true,'group_deleted',false,'conversation_id',p_conversation_id,'profile_id',p_profile_id);
END;
$function$
