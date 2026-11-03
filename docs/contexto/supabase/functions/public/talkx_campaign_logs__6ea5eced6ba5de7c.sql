CREATE OR REPLACE FUNCTION public.talkx_campaign_logs(p_campaign_id uuid, p_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 200, p_after_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, campaign_id uuid, recipient_id uuid, attempt integer, stage text, outcome text, http_status integer, error_code text, worker_id text, duration_ms integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit integer;
BEGIN
  IF NOT (public.is_admin_or_supervisor(auth.uid()) OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'talkx_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_id' USING ERRCODE = '22023';
  END IF;
  -- Cursor composto: so created_at (p_after) nao identifica a posicao quando ha
  -- empate e perde linhas. Exigir o id torna o defeito impossivel, e ruidoso se
  -- alguem repetir o padrao antigo.
  IF p_after IS NOT NULL AND p_after_id IS NULL THEN
    RAISE EXCEPTION 'talkx_campaign_logs_cursor_incompleto' USING ERRCODE = '22023';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);

  RETURN QUERY
    SELECT l.id, l.campaign_id, l.recipient_id, l.attempt, l.stage, l.outcome,
           l.http_status, l.error_code, l.worker_id, l.duration_ms, l.created_at
      FROM public.talkx_delivery_log AS l
     WHERE l.campaign_id = p_campaign_id
       AND (p_after IS NULL OR (l.created_at, l.id) > (p_after, p_after_id))
     ORDER BY l.created_at, l.id
     LIMIT v_limit;
END;
$function$
