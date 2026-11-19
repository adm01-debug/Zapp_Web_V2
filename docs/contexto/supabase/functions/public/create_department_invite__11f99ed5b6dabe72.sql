CREATE OR REPLACE FUNCTION public.create_department_invite(p_department_id uuid, p_max_uses integer DEFAULT 1, p_expires_hours integer DEFAULT 72)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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

  if not public.is_admin(auth.uid()) then
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
$function$
