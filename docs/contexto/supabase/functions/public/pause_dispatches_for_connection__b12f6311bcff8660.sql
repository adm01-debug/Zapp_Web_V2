CREATE OR REPLACE FUNCTION public.pause_dispatches_for_connection(p_connection_id uuid, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_paused integer;
BEGIN
  IF p_connection_id IS NULL THEN
    RAISE EXCEPTION 'multiplix_connection_required' USING ERRCODE = '22004';
  END IF;

  WITH alvo AS (
    UPDATE public.multiplix_dispatches
       SET status       = 'paused',
           pause_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'connection_at_risk'),
           paused_at    = statement_timestamp(),
           updated_at   = statement_timestamp()
     WHERE whatsapp_connection_id = p_connection_id
       AND status IN ('scheduled', 'sending')
    RETURNING id
  )
  SELECT count(*) INTO v_paused FROM alvo;

  -- A trilha registra o motivo por dispatch pausado: sem isso, um operador que abre o
  -- disparo depois ve "pausado" e nao sabe que a causa foi a conexao, nao o disparo.
  IF v_paused > 0 THEN
    INSERT INTO public.multiplix_events (dispatch_id, kind, payload)
    SELECT d.id, 'connection_at_risk',
           jsonb_build_object('connection_id', p_connection_id,
                              'reason', COALESCE(NULLIF(btrim(p_reason), ''), 'connection_at_risk'))
      FROM public.multiplix_dispatches AS d
     WHERE d.whatsapp_connection_id = p_connection_id
       AND d.status = 'paused'
       AND d.paused_at >= statement_timestamp() - interval '5 seconds';
  END IF;

  RETURN v_paused;
END;
$function$
