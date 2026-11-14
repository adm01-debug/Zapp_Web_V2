CREATE OR REPLACE FUNCTION public.enforce_conversation_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN
  IF OLD.conversation_status IS NOT DISTINCT FROM NEW.conversation_status THEN
    RETURN NEW;
  END IF;

  -- Decisão do dono (2026-11-13): aguardando não é arquivada.
  IF OLD.conversation_status = 'waiting' AND NEW.conversation_status = 'archived' THEN
    RAISE EXCEPTION 'conversation_waiting_cannot_be_archived'
      USING ERRCODE = 'check_violation',
            DETAIL = 'Conversa aguardando atendimento não pode ser arquivada. Atenda ou encerre antes.';
  END IF;

  IF NOT (
    (OLD.conversation_status IS NULL AND NEW.conversation_status IN ('open', 'waiting', 'resolved', 'archived')) OR
    (OLD.conversation_status = 'open'     AND NEW.conversation_status IN ('waiting', 'resolved', 'archived')) OR
    (OLD.conversation_status = 'waiting'  AND NEW.conversation_status IN ('open', 'resolved')) OR
    (OLD.conversation_status = 'resolved' AND NEW.conversation_status IN ('open', 'archived')) OR
    (OLD.conversation_status = 'archived' AND NEW.conversation_status = 'open') OR
    -- Legado (pré-§4.1): só sai para um estado canônico.
    (OLD.conversation_status IN ('pending', 'closed') AND NEW.conversation_status IN ('open', 'waiting', 'resolved', 'archived'))
  ) THEN
    RAISE EXCEPTION 'Invalid conversation_status transition: % -> %',
      OLD.conversation_status, NEW.conversation_status
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.conversation_status_changed_at = NOW();
  RETURN NEW;
END;
$function$
