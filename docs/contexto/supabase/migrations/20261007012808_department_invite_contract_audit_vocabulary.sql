alter table public.department_audit_logs
  drop constraint if exists department_audit_logs_action_check

alter table public.department_audit_logs
  add constraint department_audit_logs_action_check check (
    action in (
      'invite_created',
      'invite_revoked',
      'invite_accepted',
      'member_added',
      'member_removed',
      'whatsapp_updated',
      'department_transferred',
      'access_requested'
    )
  ) not valid

alter table public.department_invitations
  drop constraint if exists department_invitations_code_format

drop trigger if exists department_invitations_code_format_insert_trg
  on public.department_invitations

drop function if exists public.enforce_department_invitations_code_format_on_insert()

create function public.enforce_department_invitations_code_format_on_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $trigger$
begin
  if new.code is null or new.code !~ '^[A-Z0-9]{8}$' then
    raise exception 'department_invitations_code_format'
      using errcode = '23514',
            constraint = 'department_invitations_code_format',
            table = 'department_invitations',
            schema = 'public';
  end if;

  return new;
end;
$trigger$

create trigger department_invitations_code_format_insert_trg
  before insert on public.department_invitations
  for each row
  execute function public.enforce_department_invitations_code_format_on_insert()

alter table public.department_invitations
  drop constraint if exists department_invitations_status_check

alter table public.department_invitations
  add constraint department_invitations_status_check check (
    status in ('pending', 'accepted', 'expired', 'revoked')
  ) not valid

alter table public.department_invitations
  drop constraint if exists department_invitations_use_count_within_max

alter table public.department_invitations
  add constraint department_invitations_use_count_within_max check (use_count <= max_uses) not valid

create or replace function public.create_department_invite(
  p_department_id uuid,
  p_max_uses integer default 1,
  p_expires_hours integer default 72
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
declare
  v_profile_id uuid;
  v_code       text;
  v_invite_id  uuid;
  v_attempt    integer;
begin
  v_profile_id := public.current_profile_id();
  if v_profile_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not public.is_admin_or_supervisor(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  for v_attempt in 1..5 loop
    v_code := upper(substr(translate(encode(gen_random_bytes(16), 'base64'), '+/=', ''), 1, 8));
    begin
      insert into public.department_invitations(
        department_id, code, max_uses, expires_at, created_by, status
      ) values (
        p_department_id,
        v_code,
        greatest(1, p_max_uses),
        now() + (greatest(1, p_expires_hours) || ' hours')::interval,
        v_profile_id,
        'pending'
      )
      returning id into v_invite_id;
      exit;
    exception when unique_violation then
      v_invite_id := null;
    end;
  end loop;

  if v_invite_id is null then
    return jsonb_build_object('ok', false, 'error', 'code_generation_failed');
  end if;

  insert into public.department_audit_logs(department_id, action, profile_id, details)
  values (
    p_department_id,
    'invite_created',
    v_profile_id,
    jsonb_build_object('invite_id', v_invite_id, 'max_uses', greatest(1, p_max_uses))
  );

  return jsonb_build_object('ok', true, 'invite_id', v_invite_id, 'code', v_code);
end;
$f$

create or replace function public.accept_department_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
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
$f$

do $assert$
declare
  v_int int;
  t text[] := array[
    'department_audit_logs_action_check',
    'department_invitations_status_check',
    'department_invitations_use_count_within_max'
  ];
begin
  select count(*) into v_int
  from pg_constraint
  where connamespace = 'public'::regnamespace
    and conname = any (t);
  if v_int <> 3 then
    raise exception 'esperado 3 constraints do contrato, encontrado %', v_int;
  end if;

  select count(*) into v_int
  from pg_trigger
  where tgrelid = 'public.department_invitations'::regclass
    and tgname = 'department_invitations_code_format_insert_trg'
    and not tgisinternal;
  if v_int <> 1 then
    raise exception 'trigger department_invitations_code_format_insert_trg: esperado 1, encontrado %', v_int;
  end if;

  select count(*) into v_int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_department_invite'
    and pg_get_function_identity_arguments(p.oid)
        = 'p_department_id uuid, p_max_uses integer, p_expires_hours integer';
  if v_int <> 1 then
    raise exception 'create_department_invite(uuid,integer,integer): esperado 1, encontrado %', v_int;
  end if;

  select count(*) into v_int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'accept_department_invite'
    and pg_get_function_identity_arguments(p.oid) = 'p_code text';
  if v_int <> 1 then
    raise exception 'accept_department_invite(text): esperado 1, encontrado %', v_int;
  end if;
end;
$assert$
