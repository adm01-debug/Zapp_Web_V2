CREATE OR REPLACE FUNCTION public.ai_budget_reconcile()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with expired as (
    update public.ai_budget_reservations as r
       set status = 'expired',
           updated_at = now()
     where r.status = 'reserved'
       and r.expires_at <= now()
    returning 1
  )
  select coalesce(count(*), 0)::integer from expired;
$function$
