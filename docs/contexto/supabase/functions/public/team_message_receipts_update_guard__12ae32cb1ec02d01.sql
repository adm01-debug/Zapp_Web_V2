CREATE OR REPLACE FUNCTION public.team_message_receipts_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.status = 'read' AND NEW.status <> 'read' THEN
    RAISE EXCEPTION 'Cannot downgrade receipt status from read';
  END IF;
  IF NEW.status = 'read' THEN
    NEW.read_at := COALESCE(NEW.read_at, now());
  END IF;
  RETURN NEW;
END;
$function$
