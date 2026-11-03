CREATE OR REPLACE FUNCTION public.upsert_my_call(p_id uuid, p_direction text, p_status text DEFAULT NULL::text, p_channel text DEFAULT 'voip'::text, p_peer_number text DEFAULT NULL::text, p_peer_name text DEFAULT NULL::text, p_contact_id uuid DEFAULT NULL::uuid, p_provider_call_id text DEFAULT NULL::text, p_answered_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ended_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_reason text DEFAULT NULL::text, p_talk_seconds integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_profile uuid;
  v_id uuid;
begin
  select pr.id into v_profile from public.profiles pr where pr.user_id = auth.uid();
  if v_profile is null then
    raise exception 'perfil nao encontrado para o usuario autenticado' using errcode = '42501';
  end if;
  if p_direction not in ('inbound', 'outbound') then
    raise exception 'direcao invalida' using errcode = '22023';
  end if;

  insert into public.calls (
    id, agent_id, direction, status, channel, peer_number, peer_name, contact_id,
    provider_call_id, started_at, answered_at, ended_at, end_reason, talk_seconds
  ) values (
    p_id, v_profile, p_direction, coalesce(p_status, 'ringing'), coalesce(p_channel, 'voip'),
    p_peer_number, p_peer_name, p_contact_id, p_provider_call_id, now(),
    p_answered_at, p_ended_at, p_end_reason, p_talk_seconds
  )
  on conflict (id) do update set
    status = coalesce(excluded.status, public.calls.status),
    peer_number = coalesce(excluded.peer_number, public.calls.peer_number),
    peer_name = coalesce(excluded.peer_name, public.calls.peer_name),
    contact_id = coalesce(excluded.contact_id, public.calls.contact_id),
    provider_call_id = coalesce(excluded.provider_call_id, public.calls.provider_call_id),
    answered_at = coalesce(excluded.answered_at, public.calls.answered_at),
    ended_at = coalesce(excluded.ended_at, public.calls.ended_at),
    end_reason = coalesce(excluded.end_reason, public.calls.end_reason),
    answered_by = coalesce(
      public.calls.answered_by,
      case when excluded.answered_at is not null then v_profile else null end
    ),
    talk_seconds = coalesce(
      excluded.talk_seconds,
      case
        when coalesce(excluded.ended_at, public.calls.ended_at) is not null
         and coalesce(excluded.answered_at, public.calls.answered_at) is not null
        then greatest(0, extract(epoch from (
               coalesce(excluded.ended_at, public.calls.ended_at)
               - coalesce(excluded.answered_at, public.calls.answered_at)
             ))::int)
        else public.calls.talk_seconds
      end
    )
  where public.calls.agent_id = v_profile
  returning public.calls.id into v_id;

  if v_id is null then
    raise exception 'chamada pertence a outro agente' using errcode = '42501';
  end if;
  return v_id;
end;
$function$
