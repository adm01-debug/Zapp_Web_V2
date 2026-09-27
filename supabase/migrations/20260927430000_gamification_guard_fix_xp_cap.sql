-- fix(db): corrigir guard lógico + cap XP + dedup daily_goal nas funções de gamificação
-- Auditoria de 5 agentes (2026-09-27):
-- Vector 2: guard 'IS NOT NULL AND NOT (...)' estava invertido para anon (auth.uid() IS NULL).
--            Corrigido para 'auth.role() = ''anon'' OR (auth.uid() IS NOT NULL AND NOT (...))'.  
--            Distingue anon (role=anon) de service_role (uid=null mas role=service_role):
--            service_role passa (triggers, evolution-webhook); anon é bloqueado.
--            Afeta: add_agent_xp, grant_agent_achievement, increment_agent_messages.
--            (update_agent_streak e increment_agent_resolutions usam auth.role()='anon' — correto.)
-- Vector 9: add_agent_xp sem teto em p_xp (qualquer usuário podia chegar ao nível máximo).
--            Cap de 500 XP por chamada adicionado.
--            grant_agent_achievement: p_xp_reward sem teto (Codex P1 2026-09-27).
--            Cap de 500 XP por chamada adicionado — mesmo limite de add_agent_xp.
--            grant_agent_achievement: daily_goal sem dedup diário.
--            Adicionado check (earned_at AT TIME ZONE 'America/Sao_Paulo')::date >=
--            (now() AT TIME ZONE 'America/Sao_Paulo')::date após FOR UPDATE.
--            Comparar earned_at (timestamptz) com date faz upcast para timestamptz UTC;
--            converter earned_at para o fuso SP antes de extrair a data garante o boundary correto.

CREATE OR REPLACE FUNCTION public.add_agent_xp(p_profile_id uuid, p_xp integer)
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
  IF auth.role() = 'anon' OR (
    auth.uid() IS NOT NULL AND NOT (
      p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      OR is_admin_or_supervisor(auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_xp <= 0 THEN
    RAISE EXCEPTION 'p_xp must be a positive integer, got %', p_xp;
  END IF;

  IF p_xp > 500 THEN
    RAISE EXCEPTION 'p_xp exceeds single-call maximum of 500, got %', p_xp;
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

CREATE OR REPLACE FUNCTION public.grant_agent_achievement(p_profile_id uuid, p_type text, p_name text, p_description text DEFAULT NULL::text, p_xp_reward integer DEFAULT 0)
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
  IF auth.role() = 'anon' OR (
    auth.uid() IS NOT NULL AND NOT (
      p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      OR is_admin_or_supervisor(auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_xp_reward < 0 THEN
    RAISE EXCEPTION 'p_xp_reward cannot be negative, got %', p_xp_reward;
  END IF;

  IF p_xp_reward > 500 THEN
    RAISE EXCEPTION 'p_xp_reward exceeds single-call maximum of 500, got %', p_xp_reward;
  END IF;

  -- Acquire row lock first; daily_goal check runs under lock to serialize concurrent calls
  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('alreadyHad', false); END IF;

  -- daily_goal dedup: one per calendar day (São Paulo timezone boundary)
  -- earned_at is timestamptz; convert to SP timezone first so the date boundary
  -- is São Paulo midnight, not UTC midnight.
  IF p_type = 'daily_goal' AND EXISTS (
    SELECT 1 FROM agent_achievements
    WHERE profile_id = p_profile_id
      AND achievement_type = 'daily_goal'
      AND (earned_at AT TIME ZONE 'America/Sao_Paulo')::date
          >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
  ) THEN
    RETURN json_build_object('alreadyHad', true);
  END IF;

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

CREATE OR REPLACE FUNCTION public.increment_agent_messages(p_profile_id uuid, p_type text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row        agent_stats%ROWTYPE;
  v_new_sent   int;
  v_new_recv   int;
BEGIN
  IF auth.role() = 'anon' OR (
    auth.uid() IS NOT NULL AND NOT (
      p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      OR is_admin_or_supervisor(auth.uid())
    )
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
