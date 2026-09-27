CREATE OR REPLACE FUNCTION public.handle_conversation_closure_gamification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_resolved  int;
BEGIN
  -- Para UPDATE: só contar quando closed_by muda de NULL para NOT NULL
  IF TG_OP = 'UPDATE' AND (OLD.closed_by IS NOT NULL OR NEW.closed_by IS NULL) THEN
    RETURN NEW;
  END IF;

  IF NEW.closed_by IS NOT NULL THEN
    INSERT INTO public.agent_stats (
      profile_id, messages_sent, messages_received,
      conversations_resolved, current_streak, best_streak, updated_at
    )
    VALUES (NEW.closed_by, 0, 0, 1, 0, 0, now())
    ON CONFLICT (profile_id) DO UPDATE
    SET conversations_resolved = public.agent_stats.conversations_resolved + 1,
        updated_at              = now()
    RETURNING conversations_resolved INTO v_resolved;

    IF v_resolved = ANY (ARRAY[1, 10, 50, 100, 500]) THEN
      PERFORM public.grant_agent_achievement(
        NEW.closed_by,
        'resolution_milestone',
        v_resolved || ' Conversas Encerradas',
        'Você encerrou ' || v_resolved || ' conversas!',
        LEAST(100, v_resolved)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_gamification_on_closure ON public.conversation_closures;

CREATE TRIGGER trg_gamification_on_closure AFTER INSERT OR UPDATE OF closed_by ON public.conversation_closures FOR EACH ROW EXECUTE FUNCTION public.handle_conversation_closure_gamification();
