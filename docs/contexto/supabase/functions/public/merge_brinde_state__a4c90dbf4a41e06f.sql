CREATE OR REPLACE FUNCTION public.merge_brinde_state(p_session_id uuid, p_delta jsonb, p_version integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  rows_updated integer;
BEGIN
  UPDATE public.copilot_sessions
  SET
    brinde_state  = brinde_state || p_delta,
    state_version = state_version + 1,
    updated_at    = now()
  WHERE id = p_session_id
    AND state_version = p_version;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$function$
