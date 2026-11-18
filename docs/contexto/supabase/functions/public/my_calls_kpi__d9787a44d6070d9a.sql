CREATE OR REPLACE FUNCTION public.my_calls_kpi(p_scope text DEFAULT 'mine'::text, p_channel text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(total integer, outbound integer, inbound integer, missed_inbound integer, answered integer, avg_talk_seconds numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with eu as (
    select pr.id as profile_id from public.profiles pr where pr.user_id = auth.uid()
  ),
  efetivo as (
    select case
             when p_scope = 'all' and public.is_admin_or_supervisor(auth.uid()) then 'all'
             else 'mine'
           end as escopo
  )
  select coalesce(count(*), 0)::int,
         coalesce(count(*) filter (where c.direction = 'outbound'), 0)::int,
         coalesce(count(*) filter (where c.direction = 'inbound'), 0)::int,
         coalesce(count(*) filter (
           where c.direction = 'inbound'
             and (c.status = 'missed'
                  or (c.status in ('ended', 'completed') and c.answered_at is null))
         ), 0)::int,
         coalesce(count(*) filter (where c.answered_at is not null), 0)::int,
         avg(c.talk_seconds) filter (where c.talk_seconds is not null)
    from public.calls c
    cross join efetivo e
    cross join eu
   where (e.escopo = 'all' or c.agent_id = eu.profile_id)
     and (p_channel is null or c.channel = p_channel)
     and (p_from is null or c.started_at >= p_from)
     and (p_to is null or c.started_at < p_to);
$function$
