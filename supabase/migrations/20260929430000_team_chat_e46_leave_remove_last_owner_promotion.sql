-- E46: leave_team_group + remove_team_member com promoção de último owner

DROP FUNCTION IF EXISTS public.leave_team_group(uuid);
DROP FUNCTION IF EXISTS public.remove_team_member(uuid, uuid);

CREATE OR REPLACE FUNCTION public.leave_team_group(
  p_conversation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
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

  SELECT tcm.role INTO v_role
  FROM public.team_conversation_members tcm
  WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id = v_profile_id;
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_a_member'; END IF;

  SELECT
    COUNT(*) FILTER (WHERE tcm.role = 'owner') AS owners,
    COUNT(*) AS total
  INTO v_owner_count, v_total_count
  FROM public.team_conversation_members tcm
  WHERE tcm.conversation_id = p_conversation_id;

  -- Último owner: promove o membro mais antigo antes de sair
  IF v_role = 'owner' AND v_owner_count = 1 AND v_total_count > 1 THEN
    SELECT tcm.profile_id INTO v_next_owner
    FROM public.team_conversation_members tcm
    WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id <> v_profile_id
    ORDER BY tcm.joined_at ASC LIMIT 1;
    UPDATE public.team_conversation_members
      SET role = 'owner'
      WHERE conversation_id = p_conversation_id AND profile_id = v_next_owner;
  END IF;

  DELETE FROM public.team_conversation_members
  WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id;

  -- Grupo sem membros: deletar
  IF v_total_count = 1 THEN
    DELETE FROM public.team_conversations WHERE id = p_conversation_id;
    RETURN jsonb_build_object('ok',true,'left',true,'group_deleted',true,'conversation_id',p_conversation_id);
  END IF;

  RETURN jsonb_build_object('ok',true,'left',true,'group_deleted',false,'new_owner',v_next_owner,'conversation_id',p_conversation_id);
END;
$f$;

REVOKE EXECUTE ON FUNCTION public.leave_team_group(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.leave_team_group(uuid) TO   authenticated;

CREATE OR REPLACE FUNCTION public.remove_team_member(
  p_conversation_id uuid,
  p_profile_id      uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
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

  SELECT tcm.role INTO v_actor_role
  FROM public.team_conversation_members tcm
  WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id = v_actor_id;
  IF v_actor_role IS NULL THEN RAISE EXCEPTION 'actor_not_a_member'; END IF;

  -- Apenas owner ou criador pode remover membros
  IF v_actor_role <> 'owner' AND v_conv.created_by <> v_actor_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT tcm.role INTO v_target_role
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
$f$;

REVOKE EXECUTE ON FUNCTION public.remove_team_member(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.remove_team_member(uuid, uuid) TO   authenticated;
