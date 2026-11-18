CREATE OR REPLACE FUNCTION public.transfer_team_conversation_ownership(p_conversation_id uuid, p_new_owner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor      uuid := public.current_profile_id();
  v_conv       RECORD;
  v_actor_role text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_new_owner_id = v_actor THEN RAISE EXCEPTION 'cannot_transfer_to_self'; END IF;

  SELECT tc.id, tc.type, tc.created_by INTO v_conv
    FROM public.team_conversations tc
   WHERE tc.id = p_conversation_id
   FOR UPDATE;
  IF v_conv.id IS NULL THEN RAISE EXCEPTION 'conversation_not_found'; END IF;
  IF v_conv.type NOT IN ('group', 'department') THEN RAISE EXCEPTION 'not_a_group_conversation'; END IF;

  SELECT tcm.member_role INTO v_actor_role
    FROM public.team_conversation_members tcm
   WHERE tcm.conversation_id = p_conversation_id
     AND tcm.profile_id = v_actor;

  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    IF v_actor_role IS NULL THEN RAISE EXCEPTION 'actor_not_a_member'; END IF;
    IF v_actor_role <> 'owner' AND v_conv.created_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
     WHERE tcm.conversation_id = p_conversation_id
       AND tcm.profile_id = p_new_owner_id
  ) THEN
    RAISE EXCEPTION 'target_not_a_member';
  END IF;

  UPDATE public.team_conversations SET created_by = p_new_owner_id WHERE id = p_conversation_id;

  UPDATE public.team_conversation_members SET member_role = 'owner'
   WHERE conversation_id = p_conversation_id AND profile_id = p_new_owner_id;

  IF v_actor_role = 'owner' THEN
    UPDATE public.team_conversation_members SET member_role = 'member'
     WHERE conversation_id = p_conversation_id AND profile_id = v_actor;
  END IF;

  RETURN jsonb_build_object('ok', true, 'transferred', true,
                            'conversation_id', p_conversation_id, 'new_owner', p_new_owner_id);
END;
$function$
