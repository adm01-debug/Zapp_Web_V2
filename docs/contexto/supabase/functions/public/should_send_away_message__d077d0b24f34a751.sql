CREATE OR REPLACE FUNCTION public.should_send_away_message(p_contact_id uuid, p_connection_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_content text;
  v_enabled boolean;
  v_day integer;
  v_time time;
  v_is_open boolean;
  v_open_time time;
  v_close_time time;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_contact_id IS NULL OR p_connection_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1) mensagem cadastrada e ligada para a conexão
  SELECT am.content, am.is_enabled
    INTO v_content, v_enabled
  FROM public.away_messages AS am
  WHERE am.whatsapp_connection_id = p_connection_id;
  IF NOT FOUND OR NOT COALESCE(v_enabled, false)
     OR NULLIF(btrim(v_content), '') IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1b) contato já com atendente (inclusive atribuído pela carteira depois da
  -- ingestão): nunca responder automaticamente.
  IF EXISTS (
    SELECT 1 FROM public.contacts AS c
    WHERE c.id = p_contact_id AND c.assigned_to IS NOT NULL
  ) THEN
    RETURN NULL;
  END IF;

  -- 2) só fora do horário de atendimento (regra de 20261015175433_business_hours_overnight:
  -- janela que vira a noite e fechamento exclusivo)
  v_day  := EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Sao_Paulo'));
  v_time := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
  SELECT bh.is_open, bh.open_time, bh.close_time
    INTO v_is_open, v_open_time, v_close_time
  FROM public.business_hours AS bh
  WHERE bh.whatsapp_connection_id = p_connection_id
    AND bh.day_of_week = v_day;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF COALESCE(v_is_open, true) THEN
    -- Janela sem horário definido: não dá para afirmar que está fechado; não envia.
    IF v_open_time IS NULL OR v_close_time IS NULL THEN
      RETURN NULL;
    END IF;
    IF v_open_time > v_close_time THEN
      IF v_time >= v_open_time OR v_time < v_close_time THEN
        RETURN NULL;
      END IF;
    ELSIF v_time >= v_open_time AND v_time < v_close_time THEN
      RETURN NULL;
    END IF;
  END IF;

  -- 3) no máximo 1 por contato+conexão a cada 24 h
  IF EXISTS (
    SELECT 1 FROM public.away_message_log AS l
    WHERE l.contact_id = p_contact_id
      AND l.whatsapp_connection_id = p_connection_id
      AND l.sent_at > now() - interval '24 hours'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN btrim(v_content);
END;
$function$
