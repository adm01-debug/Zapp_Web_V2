-- Gamification RPC functions (SECURITY DEFINER)
-- Replaces direct table access in mutations.ts with functions that
-- bypass the agent_stats UPDATE RLS policy (admins only) safely.
-- Each function validates the caller owns the target profile.
-- service_role / trigger context (auth.uid() IS NULL) is allowed through
-- to support webhook-driven gamification without crashing message inserts.
-- Row is locked with FOR UPDATE before read-modify-write to prevent
-- concurrent XP/counter loss.

-- 1. Rebuild grant_agent_achievement: void→json, add security check
DROP FUNCTION IF EXISTS public.grant_agent_achievement(uuid, text, text, text, int);

CREATE FUNCTION public.grant_agent_achievement(
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

REVOKE EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, int)
  TO authenticated, service_role;

-- 2. add_agent_xp
CREATE FUNCTION public.add_agent_xp(
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

  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_new_xp    := v_row.xp + p_xp;
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

REVOKE EXECUTE ON FUNCTION public.add_agent_xp(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_agent_xp(uuid, int) TO authenticated, service_role;

-- 3. update_agent_streak
CREATE FUNCTION public.update_agent_streak(
  p_profile_id uuid,
  p_increment  boolean
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row             agent_stats%ROWTYPE;
  v_new_streak      int;
  v_new_best_streak int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR is_admin_or_supervisor(auth.uid())
  ) THEN
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

REVOKE EXECUTE ON FUNCTION public.update_agent_streak(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_agent_streak(uuid, boolean) TO authenticated, service_role;

-- 4. increment_agent_messages
CREATE FUNCTION public.increment_agent_messages(
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

REVOKE EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text) TO authenticated, service_role;

-- 5. increment_agent_resolutions
CREATE FUNCTION public.increment_agent_resolutions(
  p_profile_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row             agent_stats%ROWTYPE;
  v_new_resolutions int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR is_admin_or_supervisor(auth.uid())
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_new_resolutions := COALESCE(v_row.conversations_resolved, 0) + 1;

  UPDATE agent_stats
  SET conversations_resolved = v_new_resolutions,
      updated_at             = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object('newResolutions', v_new_resolutions);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_agent_resolutions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_agent_resolutions(uuid) TO authenticated, service_role;
