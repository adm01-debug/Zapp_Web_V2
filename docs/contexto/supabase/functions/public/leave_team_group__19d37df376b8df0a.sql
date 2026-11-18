CREATE OR REPLACE FUNCTION public.leave_team_group(p_conversation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id  uuid := public.current_profile_id();
  v_conv        RECORD;
  v_role        text;
  v_owner_count int;
  v_total_count int;
  v_next_owner  uuid;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT id, type, created_by INTO v_conv
  FROM public.team_conversations WHERE id = p_conversation_id FOR UPDATE;
  IF v_conv.id IS NULL THEN RAISE EXCEPTION 'conversation_not_found'; END IF;
  IF v_conv.type NOT IN ('group','department') THEN RAISE EXCEPTION 'not_a_group_conversation'; END IF;

  SELECT tcm.member_role INTO v_role
  FROM public.team_conversation_members tcm
  WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id = v_profile_id;
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_a_member'; END IF;

  SELECT
    COUNT(*) FILTER (WHERE tcm.member_role = 'owner') AS owners,
    COUNT(*) AS total
  INTO v_owner_count, v_total_count
  FROM public.team_conversation_members tcm
  WHERE tcm.conversation_id = p_conversation_id;

  IF v_role = 'owner' AND v_owner_count = 1 AND v_total_count > 1 THEN
    SELECT tcm.profile_id INTO v_next_owner
    FROM public.team_conversation_members tcm
    WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id <> v_profile_id
    ORDER BY tcm.joined_at ASC LIMIT 1;
    UPDATE public.team_conversation_members
      SET member_role = 'owner'
      WHERE conversation_id = p_conversation_id AND profile_id = v_next_owner;
  END IF;

  DELETE FROM public.team_conversation_members
  WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id;

  IF v_total_count = 1 THEN
    DELETE FROM public.team_conversations WHERE id = p_conversation_id;
    RETURN jsonb_build_object('ok',true,'left',true,'group_deleted',true,'conversation_id',p_conversation_id);
  END IF;

  RETURN jsonb_build_object('ok',true,'left',true,'group_deleted',false,'new_owner',v_next_owner,'conversation_id',p_conversation_id);
END;
$function$
