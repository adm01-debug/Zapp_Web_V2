CREATE OR REPLACE FUNCTION public.ai_rate_limit_purge(p_older_than timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with removed as (
    delete from public.edge_rate_limits as e
     where e.updated_at < p_older_than
    returning 1
  )
  select coalesce(count(*), 0)::integer from removed;
$function$
