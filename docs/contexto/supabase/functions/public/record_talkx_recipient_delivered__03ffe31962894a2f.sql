CREATE OR REPLACE FUNCTION public.record_talkx_recipient_delivered(p_external_id text, p_connection_id uuid, p_event text DEFAULT 'delivered'::text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.record_talkx_recipient_receipt(p_external_id, p_connection_id, p_event);
$function$
