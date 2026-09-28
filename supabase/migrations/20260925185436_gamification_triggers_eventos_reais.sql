CREATE OR REPLACE FUNCTION public.grant_agent_achievement(
  p_profile_id uuid,
  p_type text,
  p_name text,
  p_description text,
  p_xp_reward integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_allow_duplicates boolean := p_type IN ('daily_goal', 'streak', 'message_milestone');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_stats WHERE profile_id = p_profile_id) THEN
    RETURN;
  END IF;

  IF NOT v_allow_duplicates THEN
    SELECT EXISTS(
      SELECT 1 FROM public.agent_achievements
      WHERE profile_id = p_profile_id AND achievement_type = p_type
    ) INTO v_exists;
    IF v_exists THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.agent_achievements (profile_id, achievement_type, achievement_name, achievement_description, xp_earned)
  VALUES (p_profile_id, p_type, p_name, p_description, p_xp_reward);

  UPDATE public.agent_stats
  SET xp = xp + p_xp_reward,
      achievements_count = achievements_count + 1,
      updated_at = now()
  WHERE profile_id = p_profile_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.handle_conversation_closure_gamification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.closed_by IS NOT NULL THEN
    UPDATE public.agent_stats
    SET conversations_resolved = conversations_resolved + 1,
        updated_at = now()
    WHERE profile_id = NEW.closed_by;

    PERFORM public.grant_agent_achievement(
      NEW.closed_by, 'resolution', 'Problema Resolvido',
      'Cliente satisfeito! Problema resolvido!', 40
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_gamification_on_closure ON public.conversation_closures;
CREATE TRIGGER trg_gamification_on_closure
AFTER INSERT ON public.conversation_closures
FOR EACH ROW EXECUTE FUNCTION public.handle_conversation_closure_gamification();
CREATE OR REPLACE FUNCTION public.handle_message_gamification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_sent  int;
  v_received  int;
  v_total     int;
BEGIN
  IF NEW.sender = 'agent' AND NEW.agent_id IS NOT NULL THEN
    UPDATE public.agent_stats
    SET messages_sent  = messages_sent + 1,
        current_streak = current_streak + 1,
        best_streak    = GREATEST(best_streak, current_streak + 1),
        updated_at     = now()
    WHERE profile_id = NEW.agent_id
    RETURNING messages_sent, messages_received INTO v_new_sent, v_received;

    IF v_new_sent IS NULL THEN
      RETURN NEW;
    END IF;

    v_total := v_new_sent + v_received;
    IF v_total = ANY (ARRAY[10, 50, 100, 500, 1000]) THEN
      PERFORM public.grant_agent_achievement(
        NEW.agent_id, 'message_milestone', v_total || ' Mensagens',
        'Você enviou/recebeu ' || v_total || ' mensagens!',
        LEAST(100, v_total / 10)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_gamification_on_message_sent ON public.messages;
CREATE TRIGGER trg_gamification_on_message_sent
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.handle_message_gamification()
