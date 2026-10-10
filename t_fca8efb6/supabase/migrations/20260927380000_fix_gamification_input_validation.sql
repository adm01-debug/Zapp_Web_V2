-- fix: input validation for gamification RPCs + restrict direct INSERT on agent_achievements
-- BUG-1: add_agent_xp and grant_agent_achievement accepted negative XP values,
--        causing SQRT(negative) crash in the PostgreSQL level formula.
-- BUG-2: agent_achievements "Users can insert own achievements" policy let
--        authenticated users bypass grant_agent_achievement RPC, skipping
--        the XP credit and achievements_count increment in agent_stats.
-- BUG-3 (low): increment_agent_messages accepted any string for p_type;
--        now rejects values outside ('sent','received').

-- 1. add_agent_xp: guard p_xp > 0; GREATEST(0,...) on SQRT as safety net
CREATE OR REPLACE FUNCTION public.add_agent_xp(
  p_profile_id uuid,
  p_xp         int
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row       agent_stats%ROWTYPE;
  v_new_xp    int;
  v_new_level int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR is_admin_or_supervisor(auth.uid())
  ) THEN
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

-- 2. grant_agent_achievement: guard p_xp_reward >= 0; GREATEST(0,...) on SQRT
CREATE OR REPLACE FUNCTION public.grant_agent_achievement(
  p_profile_id   uuid,
  p_type         text,
  p_name         text,
  p_description  text DEFAULT NULL,
  p_xp_reward    int  DEFAULT 0
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_id uuid;
  v_row         agent_stats%ROWTYPE;
  v_new_xp      int;
  v_new_level   int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR is_admin_or_supervisor(auth.uid())
  ) THEN
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

-- 3. increment_agent_messages: validate p_type IN ('sent','received')
CREATE OR REPLACE FUNCTION public.increment_agent_messages(
  p_profile_id uuid,
  p_type       text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row         agent_stats%ROWTYPE;
  v_new_sent    int;
  v_new_recv    int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR is_admin_or_supervisor(auth.uid())
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_type NOT IN ('sent', 'received') THEN
    RAISE EXCEPTION 'p_type must be ''sent'' or ''received'', got %', p_type;
  END IF;

  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_new_sent := COALESCE(v_row.messages_sent, 0);
  v_new_recv := COALESCE(v_row.messages_received, 0);

  IF p_type = 'sent' THEN
    v_new_sent := v_new_sent + 1;
  ELSE
    v_new_recv := v_new_recv + 1;
  END IF;

  UPDATE agent_stats
  SET messages_sent     = v_new_sent,
      messages_received = v_new_recv,
      updated_at        = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object('newSent', v_new_sent, 'newReceived', v_new_recv);
END;
$$;

-- 4. Restrict direct INSERT on agent_achievements to admins only.
--    grant_agent_achievement is SECURITY DEFINER and bypasses RLS, so removing
--    the policy for plain authenticated users does NOT break the RPC flow.
DROP POLICY IF EXISTS "Users can insert own achievements" ON public.agent_achievements;
CREATE POLICY "Only admins can insert achievements directly" ON public.agent_achievements
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
