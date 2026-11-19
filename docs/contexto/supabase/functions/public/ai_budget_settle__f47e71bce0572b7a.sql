CREATE OR REPLACE FUNCTION public.ai_budget_settle(p_id uuid, p_actual_tokens integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  update public.ai_budget_reservations as r
     set actual_tokens = p_actual_tokens,
         status = 'settled',
         updated_at = now()
   where r.id = p_id
     and r.status = 'reserved';
$function$
