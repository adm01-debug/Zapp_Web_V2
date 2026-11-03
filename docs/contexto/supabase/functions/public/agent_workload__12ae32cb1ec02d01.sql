CREATE OR REPLACE FUNCTION public.agent_workload()
 RETURNS TABLE(profile_id uuid, open_chats integer, waiting_chats integer, last_send_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_jwt_role text;
  v_since timestamptz;
begin
  v_jwt_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');

  if v_jwt_role <> 'service_role'
     and coalesce(public.is_admin_or_supervisor(auth.uid()), false) is not true then
    raise exception 'agent_workload: acesso restrito a admin ou supervisor'
      using errcode = 'insufficient_privilege';
  end if;

  -- Mesma janela de 30 dias de RECENT_SENDS_WINDOW_DAYS (useAgentRecentSends.ts).
  v_since := now() - interval '30 days';

  return query
  with open_counts as (
    select c.assigned_to as profile_id, count(*)::integer as total
      from public.contacts c
     where c.assigned_to is not null
       and c.conversation_status = 'open'
       and c.deleted_at is null
     group by c.assigned_to
  ),
  waiting_counts as (
    select c.assigned_to as profile_id, count(*)::integer as total
      from public.contacts c
     where c.assigned_to is not null
       and c.conversation_status = 'waiting'
       and c.deleted_at is null
     group by c.assigned_to
  ),
  last_sends as (
    select m.agent_id as profile_id, max(m.created_at) as last_send_at
      from public.messages m
     where m.sender = 'agent'
       and m.agent_id is not null
       and m.created_at >= v_since
     group by m.agent_id
  )
  select p.id as profile_id,
         coalesce(o.total, 0) as open_chats,
         coalesce(w.total, 0) as waiting_chats,
         l.last_send_at as last_send_at
    from public.profiles p
    left join open_counts o on o.profile_id = p.id
    left join waiting_counts w on w.profile_id = p.id
    left join last_sends l on l.profile_id = p.id
   order by p.id;
end;
$function$
