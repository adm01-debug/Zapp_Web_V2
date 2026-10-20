-- migration: 20260927340000
-- Problema 1 (medio - crash DoS): add_agent_xp com p_xp negativo suficiente
-- para tornar v_new_xp < 0 causa SQRT(negativo) -> ERROR runtime.
-- Qualquer usuario authenticated poderia crashar a funcao mandando p_xp negativo.
-- Fix: clampar v_new_xp >= 0 antes de calcular o level.
-- Mesmo fix aplicado a grant_agent_achievement (p_xp_reward negativo).
--
-- Problema 2 (guard - LOW, ja mitigado por REVOKE FROM anon na 260000):
-- A condicao anterior `auth.uid() IS NOT NULL AND NOT (...)` deixa passar sem
-- verificacao de ownership quando uid=NULL E role!='anon' (JWT malformado hipotetico).
-- Fix: verificar auth.role()='authenticated' explicitamente antes do ownership check,
-- protegendo service_role que tem uid=NULL intencionalmente.
--
-- Aplica as 5 funcoes de gamificacao.

-- 1. add_agent_xp (protecao XP negativo + guard corrigido)
CREATE OR REPLACE FUNCTION public.add_agent_xp(
  p_profile_id uuid,
  p_xp         integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row       agent_stats%ROWTYPE;
  v_new_xp    int;
  v_new_level int;
BEGIN
  -- Guard: bloquear anon; para authenticated verificar ownership;
  -- service_role (uid=NULL, role!='anon') passa sem check de ownership.
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated' AND NOT (
           p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
           OR is_admin_or_supervisor(auth.uid())
         ))
  THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_new_xp := v_row.xp + p_xp;
  -- Clampar: evita SQRT(negativo) -> crash runtime; impede XP negativo persistido
  IF v_new_xp < 0 THEN v_new_xp := 0; END IF;

  v_new_level := GREATEST(1, FLOOR(SQRT(v_new_xp / 50.0))::int + 1);

  UPDATE agent_stats
  SET xp = v_new_xp, level = v_new_level, updated_at = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object(
    'newXp',        v_new_xp,
    'newLevel',     v_new_level,
    'previousLevel', v_row.level,
    'leveledUp',    v_new_level > v_row.level
  );
END;
$$;

-- 2. grant_agent_achievement (guard corrigido + XP negativo)
CREATE OR REPLACE FUNCTION public.grant_agent_achievement(
  p_profile_id    uuid,
  p_type          text,
  p_name          text,
  p_description   text    DEFAULT NULL,
  p_xp_reward     integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  v_new_xp := v_row.xp + p_xp_reward;
  IF v_new_xp < 0 THEN v_new_xp := 0; END IF;
  v_new_level := GREATEST(1, FLOOR(SQRT(v_new_xp / 50.0))::int + 1);

  UPDATE agent_stats
  SET xp                 = v_new_xp,
      level              = v_new_level,
      achievements_count = achievements_count + 1,
      updated_at         = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object(
    'alreadyHad', false,
    'newXp',      v_new_xp,
    'newLevel',   v_new_level,
    'leveledUp',  v_new_level > v_row.level
  );
END;
$$;

-- 3. update_agent_streak (guard corrigido)
CREATE OR REPLACE FUNCTION public.update_agent_streak(
  p_profile_id uuid,
  p_increment  boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row             agent_stats%ROWTYPE;
  v_new_streak      int;
  v_new_best_streak int;
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
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_new_best_streak := COALESCE(v_row.best_streak, 0);

  IF p_increment THEN
    v_new_streak := COALESCE(v_row.current_streak, 0) + 1;
    IF v_new_streak > v_new_best_streak THEN
      v_new_best_streak := v_new_streak;
    END IF;
  ELSE
    v_new_streak := 0;
  END IF;

  UPDATE agent_stats
  SET current_streak = v_new_streak,
      best_streak    = v_new_best_streak,
      updated_at     = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object('newStreak', v_new_streak, 'newBestStreak', v_new_best_streak);
END;
$$;

-- 4. increment_agent_messages (guard corrigido)
CREATE OR REPLACE FUNCTION public.increment_agent_messages(
  p_profile_id uuid,
  p_type       text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row agent_stats%ROWTYPE;
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
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF p_type = 'sent' THEN
    UPDATE agent_stats SET messages_sent = messages_sent + 1, updated_at = now() WHERE profile_id = p_profile_id;
    RETURN json_build_object('newSent', v_row.messages_sent + 1, 'newReceived', v_row.messages_received);
  ELSIF p_type = 'received' THEN
    UPDATE agent_stats SET messages_received = messages_received + 1, updated_at = now() WHERE profile_id = p_profile_id;
    RETURN json_build_object('newSent', v_row.messages_sent, 'newReceived', v_row.messages_received + 1);
  ELSE
    RAISE EXCEPTION 'invalid message type: %', p_type;
  END IF;
END;
$$;

-- 5. increment_agent_resolutions (guard corrigido)
CREATE OR REPLACE FUNCTION public.increment_agent_resolutions(
  p_profile_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row agent_stats%ROWTYPE;
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
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE agent_stats
  SET conversations_resolved = conversations_resolved + 1, updated_at = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object('newResolutions', v_row.conversations_resolved + 1);
END;
$$;

-- Manter grants existentes (authenticated + service_role, sem anon)
GRANT EXECUTE ON FUNCTION public.add_agent_xp(uuid, integer)                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_agent_streak(uuid, boolean)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text)                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_agent_resolutions(uuid)                        TO authenticated, service_role;

-- anon ja revogado na migration 260000; reafirmar para idempotencia
REVOKE EXECUTE ON FUNCTION public.add_agent_xp(uuid, integer)                             FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_agent_streak(uuid, boolean)                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text)                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_agent_resolutions(uuid)                        FROM anon;
