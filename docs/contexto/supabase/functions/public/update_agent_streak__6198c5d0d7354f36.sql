CREATE OR REPLACE FUNCTION public.update_agent_streak(p_profile_id uuid, p_increment boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row        agent_stats%ROWTYPE;
  v_res        json;
  v_today      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF auth.role() = 'anon' OR (
    auth.uid() IS NOT NULL AND NOT (
      p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      OR is_admin_or_supervisor(auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_increment THEN
    v_res := public.register_agent_active_day(p_profile_id, v_today);
    IF v_res IS NULL THEN RETURN NULL; END IF;
    RETURN json_build_object(
      'newStreak',     (v_res->>'newStreak')::int,
      'newBestStreak', (v_res->>'newBestStreak')::int
    );
  END IF;

  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE agent_stats
     SET current_streak   = 0,
         last_active_date = NULL,
         updated_at       = now()
   WHERE profile_id = p_profile_id;
  RETURN json_build_object('newStreak', 0, 'newBestStreak', COALESCE(v_row.best_streak, 0));
END;
$function$
