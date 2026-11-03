CREATE OR REPLACE FUNCTION public.increment_agent_resolutions(p_profile_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row agent_stats%ROWTYPE;
BEGIN
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated' AND NOT (
           p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
           OR is_admin_or_supervisor(auth.uid())
         ))
  THEN RAISE EXCEPTION 'permission denied'; END IF;
  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE agent_stats SET conversations_resolved = conversations_resolved + 1, updated_at = now() WHERE profile_id = p_profile_id;
  RETURN json_build_object('newResolutions', v_row.conversations_resolved + 1);
END; $function$
