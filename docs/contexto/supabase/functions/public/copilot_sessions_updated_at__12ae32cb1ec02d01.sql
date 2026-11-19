CREATE OR REPLACE FUNCTION public.copilot_sessions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
