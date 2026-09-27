-- Migration: 20260927440000 (v3 — assinaturas reais, UNIQUE removido)
-- BLOCO 1: Atualizar guard das 3 funcoes de gamificacao
--   - add_agent_xp: ja tinha o novo guard (aplicado anteriormente)
--   - grant_agent_achievement: preserva DEFAULT params + bigint + daily_goal check
--   - increment_agent_messages: preserva nova assinatura (p_type text) do PR #1036
-- BLOCO 2: DELETE E2E (102 rows, 2 datas)
-- BLOCO 3: UNIQUE removido — date() e STABLE, nao IMMUTABLE; INDEX falharia.
--          ON CONFLICT DO NOTHING no FSM ja previne duplicatas de sessao.
-- BLOCO 4: avg_response_time_seconds = 0 -> NULL (semantica correta)

-- ============================================================
-- BLOCO 1a: grant_agent_achievement (preserva defaults + bigint + daily_goal)
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_agent_achievement(
  p_profile_id uuid, p_type text, p_name text,
  p_description text DEFAULT NULL::text, p_xp_reward integer DEFAULT 0
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_inserted_id uuid;
  v_row         agent_stats%ROWTYPE;
  v_new_xp      bigint;
  v_new_level   int;
BEGIN
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated' AND NOT (
           p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
           OR is_admin_or_supervisor(auth.uid())
         ))
  THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_xp_reward < 0 THEN
    RAISE EXCEPTION 'p_xp_reward cannot be negative, got %', p_xp_reward;
  END IF;

  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('alreadyHad', false); END IF;

  IF p_type = 'daily_goal' THEN
    IF EXISTS (
      SELECT 1 FROM agent_achievements
      WHERE profile_id = p_profile_id
        AND achievement_type = 'daily_goal'
        AND earned_at::date = CURRENT_DATE
    ) THEN
      RETURN json_build_object('alreadyHad', true);
    END IF;
  END IF;

  INSERT INTO agent_achievements (profile_id, achievement_type, achievement_name, achievement_description, xp_earned)
  VALUES (p_profile_id, p_type, p_name, p_description, p_xp_reward)
  ON CONFLICT (profile_id, achievement_type)
    WHERE achievement_type NOT IN ('daily_goal', 'streak', 'message_milestone', 'resolution')
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN RETURN json_build_object('alreadyHad', true); END IF;

  v_new_xp    := v_row.xp + p_xp_reward;
  v_new_level := GREATEST(1, FLOOR(SQRT(GREATEST(0, v_new_xp) / 50.0))::int + 1);

  UPDATE agent_stats
  SET xp = v_new_xp, level = v_new_level, achievements_count = achievements_count + 1, updated_at = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object('alreadyHad', false, 'newXp', v_new_xp,
    'newLevel', v_new_level, 'leveledUp', v_new_level > v_row.level);
END;
$$;

-- ============================================================
-- BLOCO 1b: increment_agent_messages (preserva nova assinatura do PR #1036)
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_agent_messages(p_profile_id uuid, p_type text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_row      agent_stats%ROWTYPE;
  v_new_sent bigint;
  v_new_recv bigint;
BEGIN
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated' AND NOT (
           p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
           OR is_admin_or_supervisor(auth.uid())
         ))
  THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  p_type := lower(p_type);
  IF p_type NOT IN ('sent', 'received') THEN
    RAISE EXCEPTION 'p_type must be ''sent'' or ''received'', got %', p_type;
  END IF;

  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_new_sent := COALESCE(v_row.messages_sent, 0);
  v_new_recv := COALESCE(v_row.messages_received, 0);

  IF p_type = 'sent' THEN v_new_sent := v_new_sent + 1;
  ELSE v_new_recv := v_new_recv + 1;
  END IF;

  UPDATE agent_stats
  SET messages_sent = v_new_sent, messages_received = v_new_recv, updated_at = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object('newSent', v_new_sent, 'newReceived', v_new_recv);
END;
$$;

-- GRANTs + REVOKE anon apos CREATE OR REPLACE
GRANT EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text) FROM anon;

-- ============================================================
-- BLOCO 2: DELETE rows E2E (fixture do QA)
-- ============================================================
DELETE FROM public.conversation_closures
WHERE contact_id = '04dff4dc-c6b1-4283-ac22-bd8639804759';

-- BLOCO 3: UNIQUE removido (date() STABLE nao permite INDEX IMMUTABLE)
-- Documentado como limitacao aceita — ON CONFLICT DO NOTHING no FSM previne duplicatas.

-- ============================================================
-- BLOCO 4: avg_response_time_seconds semantica: 0 = impossivel -> NULL = sem dado
-- ============================================================
UPDATE public.agent_stats
SET avg_response_time_seconds = NULL
WHERE avg_response_time_seconds = 0;
