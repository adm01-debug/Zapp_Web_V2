-- E38/E43 (Fase 5, plano de 50 etapas): gamificação nunca recebia eventos reais.
--
-- Achado da auditoria: src/components/gamification/GamificationProvider.tsx
-- (triggerResolution/triggerMessageSent) só é consumido por
-- src/components/gamification/DemoAchievements.tsx (botões de demo). Não existe
-- nenhum call-site no fluxo real de fechamento de conversa ou envio de mensagem
-- — agent_stats/agent_achievements nunca são atualizados por uso real do
-- produto, então TeamHighlightCard (E38, leaderboard) e XP/level (E43) ficam
-- sempre zerados/estáticos em produção, mesmo com atendimento acontecendo.
--
-- Esta migration porta a MESMA regra de negócio do client (mutations.ts +
-- GamificationProvider.tsx, lidos linha a linha) para triggers server-side,
-- disparados pelos eventos reais (conversation_closures/messages), com 3
-- diferenças deliberadas em relação ao client:
--   1. Incrementos são atômicos (UPDATE ... SET x = x + delta) — o client fazia
--      read-modify-write no JS, uma condição de corrida real com dois eventos
--      simultâneos. Os valores de XP e as regras de "só uma vez" são idênticos.
--   2. calculate_level(xp)/update_agent_level() já existem (migrations de
--      2025-12-15) e recalculam `level` automaticamente a cada UPDATE de `xp`
--      — os triggers novos só tocam `xp`, nunca `level` diretamente.
--   3. Sem backfill de histórico: só passa a contar daqui pra frente. Popular
--      retroativamente conversations_resolved/messages_sent a partir do
--      histórico é uma decisão de escopo maior (reprocessar todo o histórico
--      de mensagens), fora desta etapa — ver Próximos passos.
--
-- Validado contra o schema real de produção antes do push (information_schema
-- em conversation_closures/messages/agent_stats/agent_achievements — todas as
-- colunas referenciadas abaixo existem com o tipo esperado). Os triggers em si
-- NÃO foram aplicados em produção ainda — só o push deste arquivo; aplicar é o
-- próximo passo, sujeito à aprovação (regra 8: DDL em banco de produção).

-- Função auxiliar: replica grantAchievement() de mutations.ts (checagem de
-- duplicata + insert em agent_achievements + soma de XP em agent_stats).
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
  -- Sem linha em agent_stats para este profile (não deveria acontecer —
  -- init_stats_on_profile_create cobre todo profile — mas não quebra por isso).
  IF NOT EXISTS (SELECT 1 FROM public.agent_stats WHERE profile_id = p_profile_id) THEN
    RETURN;
  END IF;

  IF NOT v_allow_duplicates THEN
    SELECT EXISTS(
      SELECT 1 FROM public.agent_achievements
      WHERE profile_id = p_profile_id AND achievement_type = p_type
    ) INTO v_exists;
    IF v_exists THEN
      RETURN; -- mesma regra do client: achievement sem allowDuplicates só é concedido 1x na vida do agente
    END IF;
  END IF;

  INSERT INTO public.agent_achievements (profile_id, achievement_type, achievement_name, achievement_description, xp_earned)
  VALUES (p_profile_id, p_type, p_name, p_description, p_xp_reward);

  UPDATE public.agent_stats
  SET xp = xp + p_xp_reward,
      achievements_count = achievements_count + 1,
      updated_at = now()
  WHERE profile_id = p_profile_id;
  -- `level` recalculado automaticamente pelo trigger existente (update_agent_level em UPDATE OF xp).
END;
$$;

-- Trigger 1/2: conversation_closures → conversations_resolved += 1 (sempre) +
-- achievement 'resolution' (+40 XP, só na primeira vez — mesma regra de
-- triggerResolution() em GamificationProvider.tsx).
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

-- Trigger 2/2: messages (sender='agent') → messages_sent += 1, streak += 1
-- (best_streak = greatest), e achievement 'message_milestone' nos marcos
-- [10,50,100,500,1000] de (messages_sent+messages_received) — mesma regra de
-- triggerMessageSent()/updateStreak(true) em GamificationProvider.tsx/mutations.ts.
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
      RETURN NEW; -- sem linha de agent_stats para este profile_id
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
FOR EACH ROW EXECUTE FUNCTION public.handle_message_gamification();
