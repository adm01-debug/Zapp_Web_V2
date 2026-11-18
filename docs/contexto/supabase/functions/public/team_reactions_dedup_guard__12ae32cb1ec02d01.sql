CREATE OR REPLACE FUNCTION public.team_reactions_dedup_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.team_message_reactions
     WHERE message_id  = NEW.message_id
       AND profile_id  = NEW.profile_id
       AND emoji       = NEW.emoji
  ) THEN
    RETURN NULL; -- silently ignore duplicate
  END IF;
  RETURN NEW;
END;
$function$
