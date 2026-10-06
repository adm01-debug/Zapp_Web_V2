-- fix_member_role_leave_remove_rpcs
-- Rollback: execute o SQL comentado abaixo para recriar integralmente os dois corpos anteriores.
-- CREATE OR REPLACE FUNCTION public.leave_team_group(p_conversation_id uuid)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_profile_id  uuid := public.current_profile_id();
--   v_conv        RECORD;
--   v_role        text;
--   v_owner_count int;
--   v_total_count int;
--   v_next_owner  uuid;
-- BEGIN
--   IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
--
--   SELECT id, type, created_by INTO v_conv
--   FROM public.team_conversations WHERE id = p_conversation_id FOR UPDATE;
--   IF v_conv.id IS NULL THEN RAISE EXCEPTION 'conversation_not_found'; END IF;
--   IF v_conv.type NOT IN ('group','department') THEN RAISE EXCEPTION 'not_a_group_conversation'; END IF;
--
--   SELECT tcm.role INTO v_role
--   FROM public.team_conversation_members tcm
--   WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id = v_profile_id;
--   IF v_role IS NULL THEN RAISE EXCEPTION 'not_a_member'; END IF;
--
--   SELECT
--     COUNT(*) FILTER (WHERE tcm.role = 'owner') AS owners,
--     COUNT(*) AS total
--   INTO v_owner_count, v_total_count
--   FROM public.team_conversation_members tcm
--   WHERE tcm.conversation_id = p_conversation_id;
--
--   IF v_role = 'owner' AND v_owner_count = 1 AND v_total_count > 1 THEN
--     SELECT tcm.profile_id INTO v_next_owner
--     FROM public.team_conversation_members tcm
--     WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id <> v_profile_id
--     ORDER BY tcm.joined_at ASC LIMIT 1;
--     UPDATE public.team_conversation_members
--       SET role = 'owner'
--       WHERE conversation_id = p_conversation_id AND profile_id = v_next_owner;
--   END IF;
--
--   DELETE FROM public.team_conversation_members
--   WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id;
--
--   IF v_total_count = 1 THEN
--     DELETE FROM public.team_conversations WHERE id = p_conversation_id;
--     RETURN jsonb_build_object('ok',true,'left',true,'group_deleted',true,'conversation_id',p_conversation_id);
--   END IF;
--
--   RETURN jsonb_build_object('ok',true,'left',true,'group_deleted',false,'new_owner',v_next_owner,'conversation_id',p_conversation_id);
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.remove_team_member(p_conversation_id uuid, p_profile_id uuid)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_actor_id    uuid := public.current_profile_id();
--   v_conv        RECORD;
--   v_actor_role  text;
--   v_target_role text;
--   v_total_count int;
-- BEGIN
--   IF v_actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
--   IF v_actor_id = p_profile_id THEN RAISE EXCEPTION 'cannot_remove_self'; END IF;
--
--   SELECT id, type, created_by INTO v_conv
--   FROM public.team_conversations WHERE id = p_conversation_id FOR UPDATE;
--   IF v_conv.id IS NULL THEN RAISE EXCEPTION 'conversation_not_found'; END IF;
--   IF v_conv.type NOT IN ('group','department') THEN RAISE EXCEPTION 'not_a_group_conversation'; END IF;
--
--   SELECT tcm.role INTO v_actor_role
--   FROM public.team_conversation_members tcm
--   WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id = v_actor_id;
--   IF v_actor_role IS NULL THEN RAISE EXCEPTION 'actor_not_a_member'; END IF;
--
--   IF v_actor_role <> 'owner' AND v_conv.created_by <> v_actor_id THEN
--     RAISE EXCEPTION 'not_authorized';
--   END IF;
--
--   SELECT tcm.role INTO v_target_role
--   FROM public.team_conversation_members tcm
--   WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id = p_profile_id;
--   IF v_target_role IS NULL THEN RAISE EXCEPTION 'target_not_a_member'; END IF;
--
--   IF v_actor_role <> 'owner' AND v_target_role = 'owner' THEN
--     RAISE EXCEPTION 'cannot_remove_owner';
--   END IF;
--
--   DELETE FROM public.team_conversation_members
--   WHERE conversation_id = p_conversation_id AND profile_id = p_profile_id;
--
--   SELECT COUNT(*) INTO v_total_count
--   FROM public.team_conversation_members WHERE conversation_id = p_conversation_id;
--
--   IF v_total_count = 0 THEN
--     DELETE FROM public.team_conversations WHERE id = p_conversation_id;
--     RETURN jsonb_build_object('ok',true,'removed',true,'group_deleted',true,'conversation_id',p_conversation_id,'profile_id',p_profile_id);
--   END IF;
--
--   RETURN jsonb_build_object('ok',true,'removed',true,'group_deleted',false,'conversation_id',p_conversation_id,'profile_id',p_profile_id);
-- END;
-- $function$;
-- Rollback end.
-- Corrige as duas RPCs de membros do team chat: `leave_team_group` e `remove_team_member`
-- consultavam/escreviam a coluna INEXISTENTE `tcm.role` em public.team_conversation_members
-- (a coluna real e `member_role`, criada na migration 20260927270006). Em runtime o plpgsql
-- estourava 42703 (column tcm.role does not exist) e os fluxos de sair do grupo e remover
-- membro ficavam quebrados.
-- Nada mais muda: mesma assinatura, mesmo RETURNS jsonb, mesma autorizacao (owner/created_by),
-- mesmas guardas (not_authenticated/not_a_member/actor_not_a_member/target_not_a_member/
-- not_authorized/cannot_remove_owner/cannot_remove_self). A promocao do proximo dono passa a
-- gravar `member_role = 'owner'` (antes gravava a coluna inexistente `role`).
-- Corpos copiados verbatim de supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql
-- (leave: linhas 996-1049; remove: linhas 1292-1344) — unica diferenca: o nome da coluna.
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
$function$;

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
$function$;
