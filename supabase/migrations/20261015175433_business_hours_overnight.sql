-- business_hours_overnight
-- Rollback: devolve o corpo ANTERIOR de public.is_within_business_hours(uuid) (comparacao `agora >= open_time AND agora <= close_time`, sem tratamento de janela que cruza a meia-noite) e a ACL de antes (authenticated/service_role com EXECUTE; PUBLIC e anon revogados).
-- Rollback (SQL executavel, na ordem):
--   CREATE OR REPLACE FUNCTION public.is_within_business_hours(connection_id uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ DECLARE v_current_day INTEGER; v_current_time TIME; v_is_open BOOLEAN; v_open_at TIME; v_close_at TIME; BEGIN IF NOT public.secd_caller_ok(NULL, false) THEN RAISE EXCEPTION 'is_within_business_hours: chamador sem sessao de usuario' USING ERRCODE = '42501'; END IF; v_current_day := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo'); v_current_time := (now() AT TIME ZONE 'America/Sao_Paulo')::TIME; SELECT bh.is_open, bh.open_time, bh.close_time INTO v_is_open, v_open_at, v_close_at FROM public.business_hours bh WHERE bh.whatsapp_connection_id = connection_id AND bh.day_of_week = v_current_day; IF NOT FOUND THEN RETURN true; END IF; IF NOT v_is_open THEN RETURN false; END IF; RETURN v_current_time >= v_open_at AND v_current_time <= v_close_at; END; $function$;
--   REVOKE EXECUTE ON FUNCTION public.is_within_business_hours(uuid) FROM PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.is_within_business_hours(uuid) TO authenticated, service_role;
--
-- CT-024 / horario comercial (t_d30b49e0): public.is_within_business_hours(uuid)
-- decidia com `agora >= open_time AND agora <= close_time`. Numa janela que VIRA A
-- NOITE (open_time > close_time, ex.: 18:00 -> 02:00) essa condicao e impossivel de
-- satisfazer: a funcao respondia FALSO o dia inteiro — o horario de atendimento
-- configurado nunca abria (nem as 19h, nem a 1h). Alem disso o `<=` tratava o
-- minuto do close_time como ABERTO.
--
-- O QUE MUDA (so o corpo; assinatura, guarda de chamador, SECURITY DEFINER,
-- search_path e ACL ficam como estao):
--   1. janela que vira a noite (open_time > close_time): aberta quando
--      `agora >= open_time` OU `agora < close_time`;
--   2. janela normal: `agora >= open_time AND agora < close_time` — FECHAMENTO
--      EXCLUSIVO (no minuto do close_time a casa esta fechada);
--   3. open_time ou close_time NULL: devolve NULL, como antes (comparacao com NULL).
-- O padrao preservado: sem linha para o dia -> true; is_open = false -> false; dia
-- que vira a noite e lido na linha do DIA DE HOJE (nao ha busca do dia anterior).
--
-- A entrada `connection_id` e um UUID de conexao (o nome do parametro na
-- assinatura em vigor e `connection_id`, mantido para nao criar overload).

CREATE OR REPLACE FUNCTION public.is_within_business_hours(connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_current_day INTEGER;
  v_current_time TIME;
  v_is_open BOOLEAN;
  v_open_at TIME;
  v_close_at TIME;
BEGIN
  IF NOT public.secd_caller_ok(NULL, false) THEN
    RAISE EXCEPTION 'is_within_business_hours: chamador sem sessao de usuario'
      USING ERRCODE = '42501';
  END IF;

  -- Get current day of week (0=Sunday) and time in Brazil timezone
  v_current_day := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo');
  v_current_time := (now() AT TIME ZONE 'America/Sao_Paulo')::TIME;

  -- Check business hours for this day
  SELECT bh.is_open, bh.open_time, bh.close_time
  INTO v_is_open, v_open_at, v_close_at
  FROM public.business_hours bh
  WHERE bh.whatsapp_connection_id = connection_id
  AND bh.day_of_week = v_current_day;

  -- If no configuration found, assume open (default behavior)
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  -- If marked as closed
  IF NOT v_is_open THEN
    RETURN false;
  END IF;

  -- Sem janela configurada: comparacao com NULL (comportamento anterior preservado)
  IF v_open_at IS NULL OR v_close_at IS NULL THEN
    RETURN NULL;
  END IF;

  -- Janela que vira a noite (ex.: 18:00 -> 02:00): aberta de open_time ate a
  -- meia-noite OU da meia-noite ate close_time (close_time exclusivo).
  IF v_open_at > v_close_at THEN
    RETURN v_current_time >= v_open_at OR v_current_time < v_close_at;
  END IF;

  -- Check if current time is within open hours (close_time exclusivo: no minuto
  -- do fechamento a casa ja esta fechada)
  RETURN v_current_time >= v_open_at AND v_current_time < v_close_at;
END;
$function$;

-- ACL explicita (idempotente: e a mesma de 20261007004545; CREATE OR REPLACE
-- preserva a ACL, este par so garante que ela nao ficou mais aberta).
REVOKE EXECUTE ON FUNCTION public.is_within_business_hours(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_within_business_hours(uuid) TO authenticated, service_role;
