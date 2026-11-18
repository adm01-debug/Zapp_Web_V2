CREATE OR REPLACE FUNCTION public.team_reactions_force_conversation_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  SELECT tm.conversation_id INTO NEW.conversation_id
    FROM public.team_messages tm
   WHERE tm.id = NEW.message_id;
  IF NEW.conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation_id_required: message % has no conversation_id', NEW.message_id;
  END IF;
  RETURN NEW;
END;
$function$
