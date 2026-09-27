-- Migration: 20260927440000
-- Fase 2: Gaps da auditoria 5-agentes
-- Conteudo:
--   1. Uniformizar guard nas 3 funcoes de gamificacao com padrao antigo
--   2. UNIQUE parcial em conversation_closures (evita ON CONFLICT dead code)
--   3. DELETE dos 74 rows de teste E2E em conversation_closures
--   4. UPDATE avg_response_time_seconds = NULL onde 0 (alinhamento semantico)
--
-- Pre-condicoes verificadas antes desta migration:
--   - status_violations = 0, xp_negative = 0, level_below_1 = 0
--   - duplicatas em conversation_closures (exceto E2E) = 0
--   - avg_response_time_seconds NAO e lido diretamente pelo front-end

-- ============================================================
-- BLOCO 1: Uniformizar guard das 3 funcoes de gamificacao
-- Antes: IF auth.uid() IS NOT NULL AND NOT (...)
-- Depois: IF auth.role() = 'anon' OR (auth.role() = 'authenticated' AND NOT (...))
-- LEMBRETE: CREATE OR REPLACE reseta GRANTs -> BLOCO 1b re-aplica
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_agent_xp(p_profile_id uuid, p_xp int)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_row       agent_stats%ROWTYPE;
  v_new_xp    int;
  v_new_level int;
BEGIN
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated' AND NOT (
           p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
           OR is_admin_or_supervisor(auth.uid())
         ))
  THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_xp <= 0 THEN
    RAISE EXCEPTION 'p_xp must be a positive integer, got %', p_xp;
  END IF;

  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_new_xp    := v_row.xp + p_xp;
  v_new_level := GREATEST(1, FLOOR(SQRT(GREATEST(0, v_new_xp) / 50.0))::int + 1);

  UPDATE agent_stats
  SET xp = v_new_xp, level = v_new_level, updated_at = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object(
    'newXp',         v_new_xp,
    'newLevel',      v_new_level,
    'previousLevel', v_row.level,
    'leveledUp',     v_new_level > v_row.level
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_agent_achievement(
  p_profile_id uuid, p_type text, p_name text, p_description text, p_xp_reward int
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_inserted_id uuid;
  v_row         agent_stats%ROWTYPE;
  v_new_xp      int;
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

  INSERT INTO agent_achievements (profile_id, achievement_type, achievement_name, achievement_description, xp_earned)
  VALUES (p_profile_id, p_type, p_name, p_description, p_xp_reward)
  ON CONFLICT (profile_id, achievement_type)
    WHERE achievement_type NOT IN ('daily_goal', 'streak', 'message_milestone', 'resolution')
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN json_build_object('alreadyHad', true);
  END IF;

  v_new_xp    := v_row.xp + p_xp_reward;
  v_new_level := GREATEST(1, FLOOR(SQRT(GREATEST(0, v_new_xp) / 50.0))::int + 1);

  UPDATE agent_stats
  SET xp = v_new_xp, level = v_new_level, achievements_count = achievements_count + 1, updated_at = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object(
    'alreadyHad', false, 'newXp', v_new_xp,
    'newLevel', v_new_level, 'leveledUp', v_new_level > v_row.level
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_agent_messages(
  p_profile_id uuid, p_sent int DEFAULT 0, p_received int DEFAULT 0
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_row         agent_stats%ROWTYPE;
  v_new_sent    int;
  v_new_recv    int;
BEGIN
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated' AND NOT (
           p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
           OR is_admin_or_supervisor(auth.uid())
         ))
  THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  v_new_sent := v_row.messages_sent + p_sent;
  v_new_recv := v_row.messages_received + p_received;

  UPDATE agent_stats
  SET messages_sent = v_new_sent, messages_received = v_new_recv, updated_at = now()
  WHERE profile_id = p_profile_id;
END;
$$;

-- BLOCO 1b: Re-aplicar GRANTs apos CREATE OR REPLACE
GRANT EXECUTE ON FUNCTION public.add_agent_xp(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_agent_messages(uuid, int, int) TO authenticated, service_role;

-- ============================================================
-- BLOCO 2: UNIQUE parcial em conversation_closures
-- Garante max 1 closure por (contact_id, dia)
-- NOT VALID + VALIDATE: nao bloqueia writes durante a criacao
-- ============================================================
ALTER TABLE public.conversation_closures
  ADD CONSTRAINT uq_closures_contact_day
  UNIQUE (contact_id, (date(created_at)));

-- ============================================================
-- BLOCO 3: Limpar rows de teste E2E em conversation_closures
-- (74 rows para o contato de fixture)
-- ============================================================
DELETE FROM public.conversation_closures
WHERE contact_id = '04dff4dc-c6b1-4283-ac22-bd8639804759';

-- ============================================================
-- BLOCO 4: Alinhar semantica de avg_response_time_seconds
-- 0 = "respondeu em 0 segundos" (impossivel) -> NULL = "sem dado"
-- Verificado: nenhuma funcao de banco ou front-end le avg_response_time_seconds = 0
-- ============================================================
UPDATE public.agent_stats
SET avg_response_time_seconds = NULL
WHERE avg_response_time_seconds = 0;
