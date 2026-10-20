-- team_chat_department_create_transfer_guards
-- Rollback: restaurar os corpos de 20261004185228 das duas funções (sem a guarda de
-- departamento na criação e sem a exigência de ator-membro na transferência):
--   create or replace function public.create_team_group_conversation(p_name text default null, p_member_ids uuid[] default array[]::uuid[], p_department_id uuid default null) returns uuid language plpgsql security definer set search_path = public as $f$ declare v_profile_id uuid := public.current_profile_id(); v_conv_id uuid; v_type text; v_member uuid; begin if v_profile_id is null then raise exception 'not_authenticated'; end if; v_type := case when p_department_id is null then 'group' else 'department' end; if v_type = 'group' and nullif(btrim(coalesce(p_name, '')), '') is null then raise exception 'group_name_required'; end if; if v_type = 'department' then select tc.id into v_conv_id from public.team_conversations tc where tc.type = 'department' and tc.department_id = p_department_id; if v_conv_id is not null then return v_conv_id; end if; end if; insert into public.team_conversations (type, name, created_by, department_id) values (v_type, nullif(btrim(coalesce(p_name, '')), ''), v_profile_id, p_department_id) returning id into v_conv_id; insert into public.team_conversation_members (conversation_id, profile_id, member_role) values (v_conv_id, v_profile_id, 'owner'); foreach v_member in array p_member_ids loop if v_member is not null and v_member <> v_profile_id then insert into public.team_conversation_members (conversation_id, profile_id, member_role) values (v_conv_id, v_member, 'member') on conflict (conversation_id, profile_id) do nothing; end if; end loop; return v_conv_id; end; $f$;
--   create or replace function public.transfer_team_conversation_ownership(p_conversation_id uuid, p_new_owner_id uuid) returns jsonb language plpgsql security definer set search_path = public as $f$ declare v_actor uuid := public.current_profile_id(); v_conv record; v_actor_owner boolean; begin if v_actor is null then raise exception 'not_authenticated'; end if; if p_new_owner_id = v_actor then raise exception 'cannot_transfer_to_self'; end if; select tc.id, tc.type, tc.created_by into v_conv from public.team_conversations tc where tc.id = p_conversation_id for update; if v_conv.id is null then raise exception 'conversation_not_found'; end if; if v_conv.type not in ('group', 'department') then raise exception 'not_a_group_conversation'; end if; select exists (select 1 from public.team_conversation_members tcm where tcm.conversation_id = p_conversation_id and tcm.profile_id = v_actor and tcm.member_role = 'owner') into v_actor_owner; if not v_actor_owner and v_conv.created_by is distinct from v_actor and not public.is_admin_or_supervisor(auth.uid()) then raise exception 'not_authorized'; end if; if not exists (select 1 from public.team_conversation_members tcm where tcm.conversation_id = p_conversation_id and tcm.profile_id = p_new_owner_id) then raise exception 'target_not_a_member'; end if; update public.team_conversations set created_by = p_new_owner_id where id = p_conversation_id; update public.team_conversation_members set member_role = 'owner' where conversation_id = p_conversation_id and profile_id = p_new_owner_id; if v_actor_owner then update public.team_conversation_members set member_role = 'member' where conversation_id = p_conversation_id and profile_id = v_actor; end if; return jsonb_build_object('ok', true, 'transferred', true, 'conversation_id', p_conversation_id, 'new_owner', p_new_owner_id); end; $f$;
--
-- QA5-10 (P1, cartão t_ab98c520): duas frestas deixadas por 20261004185228 —
--   a) create_team_group_conversation criava a conversa de QUALQUER departamento
--      para qualquer autenticado, que virava owner dela;
--   b) transfer_team_conversation_ownership aceitava o ator só por ser o
--      created_by — quem já saiu do grupo (membership removida) continuava
--      podendo transferir a propriedade.
-- Sem BEGIN/COMMIT: a migration aplica numa única transação; qualquer erro desfaz tudo.

-- 1) Criação de conversa de departamento exige admin/supervisor (user_roles) ou
--    perfil vinculado ao departamento (profiles.department_id). A checagem vem
--    ANTES do get-or-create: não-membro não cria, não vira dono e nem descobre o
--    id da conversa do departamento. Criação de grupo livre não muda.
CREATE OR REPLACE FUNCTION public.create_team_group_conversation(
  p_name          text   DEFAULT NULL,
  p_member_ids    uuid[] DEFAULT ARRAY[]::uuid[],
  p_department_id uuid   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_conv_id    uuid;
  v_type       text;
  v_member     uuid;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  v_type := CASE WHEN p_department_id IS NULL THEN 'group' ELSE 'department' END;

  IF v_type = 'group' AND NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'group_name_required';
  END IF;

  IF v_type = 'department' THEN
    IF NOT public.is_admin_or_supervisor(auth.uid())
       AND NOT EXISTS (
         SELECT 1 FROM public.profiles p
          WHERE p.id = v_profile_id AND p.department_id = p_department_id
       ) THEN
      RAISE EXCEPTION 'department_membership_required';
    END IF;

    -- get-or-create: uma conversa por departamento (idx_team_conversations_dept_unique).
    -- Retorna sem mexer nos membros: quem não é membro continua sem ver a conversa.
    SELECT tc.id INTO v_conv_id
      FROM public.team_conversations tc
     WHERE tc.type = 'department' AND tc.department_id = p_department_id;
    IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;
  END IF;

  INSERT INTO public.team_conversations (type, name, created_by, department_id)
  VALUES (v_type, NULLIF(btrim(COALESCE(p_name, '')), ''), v_profile_id, p_department_id)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role)
  VALUES (v_conv_id, v_profile_id, 'owner');

  FOREACH v_member IN ARRAY p_member_ids LOOP
    IF v_member IS NOT NULL AND v_member <> v_profile_id THEN
      INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role)
      VALUES (v_conv_id, v_member, 'member')
      ON CONFLICT (conversation_id, profile_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_conv_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_team_group_conversation(text, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_group_conversation(text, uuid[], uuid) TO authenticated;

-- 2) Transferência de propriedade exige ator MEMBRO da conversa (owner ou o
--    created_by com membership) — ou admin/supervisor. Antes bastava ser o
--    created_by: quem saía do grupo (ex.: leave_team_group, que não limpa
--    created_by) seguia transferindo a propriedade de fora.
CREATE OR REPLACE FUNCTION public.transfer_team_conversation_ownership(p_conversation_id uuid, p_new_owner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
$function$;

REVOKE EXECUTE ON FUNCTION public.transfer_team_conversation_ownership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_team_conversation_ownership(uuid, uuid) TO authenticated;
