CREATE OR REPLACE FUNCTION public.register_agent_active_day(p_profile_id uuid, p_day date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row        agent_stats%ROWTYPE;
  v_new_streak int;
  v_new_best   int;
BEGIN
  IF p_profile_id IS NULL OR p_day IS NULL THEN
    RETURN json_build_object('registered', false, 'newStreak', NULL, 'newBestStreak', NULL);
  END IF;

  SELECT * INTO v_row FROM public.agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Mesmo dia: idempotente (N mensagens no dia contam 1).
  IF v_row.last_active_date = p_day THEN
    RETURN json_build_object('registered', false, 'newStreak', v_row.current_streak, 'newBestStreak', v_row.best_streak);
  END IF;

  -- Evento retrocedido (dia anterior ao último registrado): não mexe na sequência.
  IF v_row.last_active_date IS NOT NULL AND p_day < v_row.last_active_date THEN
    RETURN json_build_object('registered', false, 'newStreak', v_row.current_streak, 'newBestStreak', v_row.best_streak);
  END IF;

  IF v_row.last_active_date = p_day - 1 THEN
    v_new_streak := COALESCE(v_row.current_streak, 0) + 1;   -- dia seguinte: soma 1
  ELSE
    v_new_streak := 1;                                        -- pulou um dia ou mais: reinicia
  END IF;
  v_new_best := GREATEST(COALESCE(v_row.best_streak, 0), v_new_streak);

  UPDATE public.agent_stats
     SET current_streak   = v_new_streak,
         best_streak      = v_new_best,
         last_active_date = p_day
   WHERE profile_id = p_profile_id;

  RETURN json_build_object('registered', true, 'newStreak', v_new_streak, 'newBestStreak', v_new_best);
END;
$function$
