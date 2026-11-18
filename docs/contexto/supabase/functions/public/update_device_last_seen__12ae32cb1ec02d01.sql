CREATE OR REPLACE FUNCTION public.update_device_last_seen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.last_seen_at = now();
    RETURN NEW;
END;
$function$
