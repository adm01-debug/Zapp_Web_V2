CREATE OR REPLACE FUNCTION public.ai_budget_release(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  update public.ai_budget_reservations as r
     set status = 'released',
         updated_at = now()
   where r.id = p_id
     and r.status = 'reserved';
$function$
