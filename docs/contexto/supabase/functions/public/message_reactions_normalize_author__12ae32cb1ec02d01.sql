CREATE OR REPLACE FUNCTION public.message_reactions_normalize_author()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    NEW.contact_id := NULL;
  END IF;
  RETURN NEW;
END;
$function$
