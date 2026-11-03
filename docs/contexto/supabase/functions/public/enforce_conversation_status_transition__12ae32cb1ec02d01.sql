CREATE OR REPLACE FUNCTION public.enforce_conversation_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN
  -- No-op when status is unchanged (WHEN clause already guards, but defensive)
  IF OLD.conversation_status IS NOT DISTINCT FROM NEW.conversation_status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.conversation_status = 'open'     AND NEW.conversation_status IN ('pending', 'waiting', 'resolved', 'closed', 'archived')) OR
    (OLD.conversation_status = 'pending'  AND NEW.conversation_status IN ('open', 'waiting', 'resolved', 'closed', 'archived')) OR
    (OLD.conversation_status = 'waiting'  AND NEW.conversation_status IN ('open', 'pending', 'resolved', 'closed', 'archived')) OR
    (OLD.conversation_status = 'resolved' AND NEW.conversation_status IN ('open', 'pending', 'closed', 'archived')) OR
    (OLD.conversation_status = 'closed'   AND NEW.conversation_status IN ('open', 'pending', 'archived')) OR
    (OLD.conversation_status = 'archived' AND NEW.conversation_status IN ('open', 'pending'))
  ) THEN
    RAISE EXCEPTION 'Invalid conversation_status transition: % -> %',
      OLD.conversation_status, NEW.conversation_status
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.conversation_status_changed_at = NOW();
  RETURN NEW;
END;
$function$
