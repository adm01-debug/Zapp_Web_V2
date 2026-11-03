CREATE OR REPLACE FUNCTION public.grant_agent_achievement_internal(
  p_profile_id  uuid,
  p_type        text,
  p_name        text,
  p_description text,
  p_xp_reward   integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inserted_id uuid;
  v_row         agent_stats%ROWTYPE;
  v_new_xp      bigint;
  v_new_level   int;
BEGIN
  IF p_xp_reward < 0 THEN
    RAISE EXCEPTION 'p_xp_reward cannot be negative, got %', p_xp_reward;
  END IF;
  IF p_xp_reward > 500 THEN
    RAISE EXCEPTION 'p_xp_reward exceeds single-call maximum of 500, got %', p_xp_reward;
  END IF;

  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('alreadyHad', false);
  END IF;

  IF p_type = 'daily_goal' AND EXISTS (
    SELECT 1 FROM agent_achievements
    WHERE profile_id = p_profile_id
      AND achievement_type = 'daily_goal'
      AND (earned_at AT TIME ZONE 'America/Sao_Paulo')::date
          >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
  ) THEN
    RETURN json_build_object('alreadyHad', true);
  END IF;

  INSERT INTO agent_achievements
    (profile_id, achievement_type, achievement_name, achievement_description, xp_earned)
  VALUES
    (p_profile_id, p_type, p_name, p_description, p_xp_reward)
  ON CONFLICT (profile_id, achievement_type)
    WHERE achievement_type NOT IN (
      'daily_goal', 'streak', 'message_milestone', 'resolution', 'resolution_milestone'
    )
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
$function$;

-- Rotina interna: nenhum cliente a alcanca (o default de CREATE FUNCTION seria EXECUTE
-- para PUBLIC). O trigger SECURITY DEFINER roda como o owner (postgres) e a alcanca.
REVOKE ALL ON FUNCTION public.grant_agent_achievement_internal(uuid, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_message_gamification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_new_sent  int;
  v_received  int;
  v_total     int;
  v_agent_id  uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.agent_id IS NOT NULL OR NEW.agent_id IS NULL) THEN
    RETURN NEW;
  END IF;
  IF NEW.sender = 'agent' AND NEW.agent_id IS NOT NULL THEN
    INSERT INTO public.agent_stats (profile_id, messages_sent, messages_received, current_streak, best_streak, updated_at)
    VALUES (NEW.agent_id, 1, 0, 1, 1, now())
    ON CONFLICT (profile_id) DO UPDATE
    SET messages_sent  = public.agent_stats.messages_sent + 1,
        current_streak = public.agent_stats.current_streak + 1,
        best_streak    = GREATEST(public.agent_stats.best_streak, public.agent_stats.current_streak + 1),
        updated_at     = now()
    RETURNING messages_sent, messages_received INTO v_new_sent, v_received;
    v_total := v_new_sent + v_received;
    IF v_total = ANY (ARRAY[10, 50, 100, 500, 1000]) THEN
      PERFORM public.grant_agent_achievement_internal(
        NEW.agent_id, 'message_milestone', v_total || ' Mensagens',
        'Você enviou/recebeu ' || v_total || ' mensagens!',
        LEAST(100, v_total / 10)
      );
    END IF;
  ELSIF NEW.sender = 'contact' THEN
    SELECT assigned_to INTO v_agent_id FROM public.contacts WHERE id = NEW.contact_id;
    IF v_agent_id IS NOT NULL THEN
      INSERT INTO public.agent_stats (profile_id, messages_sent, messages_received, current_streak, best_streak, updated_at)
      VALUES (v_agent_id, 0, 1, 0, 0, now())
      ON CONFLICT (profile_id) DO UPDATE
      SET messages_received = public.agent_stats.messages_received + 1,
          updated_at        = now()
      RETURNING messages_sent, messages_received INTO v_new_sent, v_received;
      v_total := v_new_sent + v_received;
      IF v_total = ANY (ARRAY[10, 50, 100, 500, 1000]) THEN
        PERFORM public.grant_agent_achievement_internal(
          v_agent_id, 'message_milestone', v_total || ' Mensagens',
          'Você enviou/recebeu ' || v_total || ' mensagens!',
          LEAST(100, v_total / 10)
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Gamificacao NUNCA pode reverter o enfileiramento/atendimento (mesma regra de
  -- handle_conversation_closure_gamification).
  RAISE WARNING 'gamification error in handle_message_gamification (message_id=%): % [%]',
    NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;
