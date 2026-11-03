CREATE OR REPLACE FUNCTION public.log_message_attempt(p_message_id uuid, p_attempt_no integer, p_outcome text, p_error_code text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text, p_provider_status integer DEFAULT NULL::integer, p_provider_response jsonb DEFAULT NULL::jsonb, p_duration_ms integer DEFAULT NULL::integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF p_outcome IS NULL
     OR p_outcome NOT IN ('claimed', 'sent', 'failed_retryable', 'failed_final') THEN
    RAISE EXCEPTION 'invalid_outcome: %', p_outcome USING ERRCODE = '22023';
  END IF;

  IF p_attempt_no IS NULL OR p_attempt_no < 1 THEN
    RAISE EXCEPTION 'invalid_attempt_no: %', p_attempt_no USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.messages AS m WHERE m.id = p_message_id) THEN
    RAISE EXCEPTION 'message_not_found: %', p_message_id USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.message_attempts (
    message_id, attempt_no, outcome, error_code, error_message,
    provider_status, provider_response, duration_ms
  ) VALUES (
    p_message_id, p_attempt_no, p_outcome, p_error_code, p_error_message,
    p_provider_status, p_provider_response, p_duration_ms
  )
  ON CONFLICT (message_id, attempt_no, outcome) DO NOTHING;

  RETURN FOUND;
END;
$function$
