CREATE OR REPLACE FUNCTION public.handle_conversation_closure_gamification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_resolved  bigint;
  v_day       date;
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

    v_day := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
    PERFORM public.register_agent_active_day(NEW.closed_by, v_day);

    IF v_resolved = ANY (ARRAY[1, 10, 50, 100, 500]) THEN
      -- Bloco aninhado: se a conquista falhar, o dia ativo (e conversations_resolved)
      -- ja gravados ACIMA continuam valendo. Sem isto, o EXCEPTION WHEN OTHERS do
      -- bloco externo desfazia tudo o que a funcao tinha escrito naquele fechamento
      -- (o gancho de streak se perdia junto).
      BEGIN
        PERFORM public.grant_agent_achievement(
          NEW.closed_by,
          'resolution_milestone',
          v_resolved || ' Conversas Encerradas',
          'Você encerrou ' || v_resolved || ' conversas!',
          LEAST(100, v_resolved)
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'gamification achievement error in closure (closure_id=%): % [%]',
          NEW.id, SQLERRM, SQLSTATE;
      END;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Gamificação NUNCA pode reverter fechamento de conversa
  RAISE WARNING 'gamification error in handle_conversation_closure_gamification (closure_id=%): % [%]',
    NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$
