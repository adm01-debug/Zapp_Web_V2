CREATE OR REPLACE FUNCTION public.team_messages_validate_reply_to()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.reply_to_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.team_messages
      WHERE id = NEW.reply_to_id
        AND conversation_id = NEW.conversation_id
    ) THEN
      RAISE EXCEPTION 'reply_to_id must belong to same conversation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
