-- Corrige XP de gamificação travado após a 1ª resolução de conversa por agente.
--
-- Bug: grant_agent_achievement() bloqueava duplicatas do tipo 'resolution' sem
-- exceção (só 'daily_goal', 'streak' e 'message_milestone' tinham permissão de
-- repetir). handle_conversation_closure_gamification() chama
-- grant_agent_achievement(..., 'resolution', ...) em TODO fechamento de
-- conversa — a partir da 2ª conversa fechada por um agente, o XP travava para
-- sempre, embora agent_stats.conversations_resolved continuasse contando certo.
--
-- Corrige também uma condição de corrida (TOCTOU) real no padrão anterior
-- (SELECT EXISTS -> IF -> INSERT): duas transações concorrentes podiam
-- duplicar uma conquista "de marco único" (tipos fora da lista de
-- recorrentes). A nova versão usa INSERT ... ON CONFLICT DO NOTHING apoiado
-- num índice único parcial, atômico por natureza.
--
-- Testado nesta sessão contra dados reais (revertido antes de commitar):
--   - 'resolution' chamado 2x seguidas para o mesmo profile_id: antes da
--     correção, só a 1ª chamada concedia XP; depois da correção, ambas
--     concedem (xp 40 -> 80, achievements_count 1 -> 2).
--   - Um tipo não-recorrente chamado 2x seguidas: concede XP só na 1ª vez
--     nas duas versões (comportamento de "conquista única" preservado).

CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_achievements_one_time
  ON public.agent_achievements (profile_id, achievement_type)
  WHERE achievement_type NOT IN ('daily_goal', 'streak', 'message_milestone', 'resolution');

CREATE OR REPLACE FUNCTION public.grant_agent_achievement(p_profile_id uuid, p_type text, p_name text, p_description text, p_xp_reward integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_stats WHERE profile_id = p_profile_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.agent_achievements (profile_id, achievement_type, achievement_name, achievement_description, xp_earned)
  VALUES (p_profile_id, p_type, p_name, p_description, p_xp_reward)
  ON CONFLICT (profile_id, achievement_type) WHERE achievement_type NOT IN ('daily_goal', 'streak', 'message_milestone', 'resolution')
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.agent_stats
  SET xp = xp + p_xp_reward,
      achievements_count = achievements_count + 1,
      updated_at = now()
  WHERE profile_id = p_profile_id;
END;
$function$;
