CREATE OR REPLACE FUNCTION public.team_receipts_no_own_sender()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.team_messages
     WHERE id = NEW.message_id
       AND sender_id = NEW.profile_id
  ) THEN
    RAISE EXCEPTION 'sender cannot create receipt for own message';
  END IF;
  RETURN NEW;
END;
$function$
