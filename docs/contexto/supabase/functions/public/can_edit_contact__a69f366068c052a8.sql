CREATE OR REPLACE FUNCTION public.can_edit_contact(p_assigned_to uuid, p_queue_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.can_edit_contact(p_assigned_to, p_queue_id, NULL::uuid[], NULL::uuid, NULL::boolean)
$function$
