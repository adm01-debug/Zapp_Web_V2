CREATE OR REPLACE FUNCTION public.accept_department_invite(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_invite     public.department_invitations%rowtype;
  v_profile_id uuid;
  v_dept_atual uuid;
begin
  v_profile_id := public.current_profile_id();
  if v_profile_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_invite
  from public.department_invitations
  where code = upper(trim(p_code))
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;

  if v_invite.use_count >= v_invite.max_uses then
    return jsonb_build_object('ok', false, 'error', 'invite_exhausted');
  end if;

  select department_id into v_dept_atual
  from public.profiles
  where id = v_profile_id;

  if v_dept_atual is not null and v_dept_atual = v_invite.department_id then
    return jsonb_build_object('ok', false, 'error', 'already_member');
  end if;

  update public.department_invitations
  set use_count = use_count + 1,
      used_at   = case when use_count + 1 >= max_uses then now() else used_at end,
      used_by   = case when use_count + 1 >= max_uses then v_profile_id else used_by end,
      status    = case when use_count + 1 >= max_uses then 'accepted' else status end
  where id = v_invite.id;

  -- Toca UMA linha: o perfil de quem aceita (o mesmo UPDATE que a RPC antiga já
  -- fazia). O gatilho do ambiente `update_profiles_updated_at` (BEFORE UPDATE, por
  -- linha) regrava o updated_at só dessa linha — não é backfill de tabela inteira.
  -- Provado linha a linha no teste deste cartão (asserts B.7f–B.7i).
  update public.profiles
  set department_id = v_invite.department_id
  where id = v_profile_id;

  insert into public.department_audit_logs(department_id, action, profile_id, details)
  values (
    v_invite.department_id,
    'invite_accepted',
    v_profile_id,
    jsonb_build_object('invite_id', v_invite.id)
  );

  return jsonb_build_object('ok', true, 'department_id', v_invite.department_id);
end;
$function$
