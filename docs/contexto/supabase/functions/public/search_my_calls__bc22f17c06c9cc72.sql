CREATE OR REPLACE FUNCTION public.search_my_calls(p_scope text DEFAULT 'mine'::text, p_channel text DEFAULT NULL::text, p_direction text DEFAULT NULL::text, p_result text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_q text DEFAULT NULL::text, p_limit integer DEFAULT 8, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, channel text, direction text, status text, end_reason text, started_at timestamp with time zone, answered_at timestamp with time zone, ended_at timestamp with time zone, talk_seconds integer, peer_number text, peer_name text, contact_id uuid, contact_name text, contact_phone text, contact_avatar_url text, agent_id uuid, answered_by uuid, recording_status text, agent_notes text, notes text, total_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with eu as (
    select pr.id as profile_id
      from public.profiles pr
     where pr.user_id = auth.uid()
  ),
  efetivo as (
    select case
             when p_scope = 'all' and public.is_admin_or_supervisor(auth.uid()) then 'all'
             else 'mine'
           end as escopo
  ),
  base as (
    select c.*,
           ct.name as c_nome,
           ct.phone as c_telefone,
           ct.avatar_url as c_avatar
      from public.calls c
      left join public.contacts ct on ct.id = c.contact_id
      cross join efetivo e
      cross join eu
     where (e.escopo = 'all' or c.agent_id = eu.profile_id)
       and (p_channel is null or c.channel = p_channel)
       and (p_direction is null or c.direction = p_direction)
       and (p_from is null or c.started_at >= p_from)
       and (p_to is null or c.started_at < p_to)
       and (p_result is null or (
              (p_result = 'completed'
                and c.status in ('ended', 'completed') and c.answered_at is not null)
           or (p_result = 'missed' and (
                 c.status = 'missed'
              or (c.status in ('ended', 'completed') and c.answered_at is null
                  and c.direction = 'inbound')))
           or (p_result = 'no_answer'
                and c.status in ('ended', 'completed') and c.answered_at is null
                and c.direction = 'outbound')
           or (p_result = 'busy' and c.status = 'busy')
           or (p_result = 'failed' and c.status = 'failed')
           or (p_result = 'cancelled' and c.status = 'cancelled')
           or (p_result = 'declined' and c.status = 'declined')
           or (p_result = 'in_progress'
                and c.status in ('answered', 'ongoing') and c.ended_at is null)
           or (p_result = 'ringing' and c.status = 'ringing' and c.ended_at is null)
       ))
       and (
         p_q is null or btrim(p_q) = ''
         or (
           length(regexp_replace(p_q, '\D', '', 'g')) >= 4
           and coalesce(c.peer_number, ct.phone) ilike '%' || regexp_replace(p_q, '\D', '', 'g') || '%'
         )
         or coalesce(c.peer_name, ct.name) ilike '%' || btrim(p_q) || '%'
       )
  )
  select b.id,
         b.channel,
         b.direction,
         b.status,
         b.end_reason,
         b.started_at,
         b.answered_at,
         b.ended_at,
         b.talk_seconds,
         coalesce(b.peer_number, b.c_telefone) as peer_number,
         coalesce(b.peer_name, b.c_nome) as peer_name,
         b.contact_id,
         b.c_nome as contact_name,
         b.c_telefone as contact_phone,
         b.c_avatar as contact_avatar_url,
         b.agent_id,
         b.answered_by,
         b.recording_status,
         b.agent_notes,
         b.notes,
         count(*) over () as total_count
    from base b
   order by b.started_at desc, b.id desc
   limit least(greatest(coalesce(p_limit, 8), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$function$
