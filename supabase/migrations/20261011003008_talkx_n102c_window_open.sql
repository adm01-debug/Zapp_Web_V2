-- N-102c: janela de envio server-side, compatível com a assinatura de 20261011000003.
-- Migration ainda não aplicada no canônico em 2026-10-16 (ledger de 818 versões).
-- Preserva TABLE(allowed, reason, next_window): CREATE OR REPLACE não pode trocar
-- esse retorno por boolean. Preserva também DND, timezone, janela e business_hours.
-- Rollback: reaplicar a definição e ACL de talkx_campaign_window_open de
-- 20261011000003_20261010_talkx_campaigns_dnd_weekdays.sql; não há dados alterados.
-- A função anterior pertence à migration predecessora: não usar DROP CASCADE.

CREATE OR REPLACE FUNCTION public.talkx_campaign_window_open(
  p_campaign_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS TABLE (allowed boolean, reason text, next_window timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_tz text;
  v_local_ts timestamp;
  v_dnd_hours jsonb;
  v_weekday smallint;
  v_now_minutes integer;
  v_start_minutes integer;
  v_end_minutes integer;
BEGIN
  -- Somente o scheduler (service_role) consulta esta RPC após N-102c.
  -- SECURITY DEFINER exige verificar o papel JWT, não current_user (dono).
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns
   WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Fuso da campanha: hora, dia e o "hoje" dos feriados vêm de p_at no
  -- schedule_timezone dela. Fuso inválido fecha (fail-closed).
  BEGIN
    v_tz := COALESCE(NULLIF(v_campaign.schedule_timezone, ''), 'America/Sao_Paulo');
    v_local_ts := p_at AT TIME ZONE v_tz;
  EXCEPTION
    WHEN invalid_parameter_value THEN
      RETURN QUERY SELECT false, 'invalid_timezone', NULL::timestamptz;
      RETURN;
  END;
  v_weekday := EXTRACT(DOW FROM v_local_ts)::smallint;
  v_now_minutes := EXTRACT(HOUR FROM v_local_ts)::integer * 60
    + EXTRACT(MINUTE FROM v_local_ts)::integer;

  -- 1) Verificar send_weekdays (null = todos os dias permitidos).
  IF v_campaign.send_weekdays IS NOT NULL THEN
    IF NOT (v_weekday = ANY(v_campaign.send_weekdays)) THEN
      RETURN QUERY SELECT false, 'outside_weekdays', NULL::timestamptz;
      RETURN;
    END IF;
  END IF;

  -- 2) Horário de não perturbar (talkx_settings.dnd_hours), SOMENTE quando a
  --    campanha optou (respect_dnd; default true). Contrato:
  --    { start HH:MM, end HH:MM, sundays bool, holidays YYYY-MM-DD[] }.
  --    DND que vira a meia-noite cobre os dois lados; fim exclusivo.
  --    Fora do contrato fecha (reason dnd). Domingos/feriados só bloqueiam
  --    quando o setting manda — sem bloqueio padrão.
  IF COALESCE(v_campaign.respect_dnd, true) THEN
    SELECT value INTO v_dnd_hours
      FROM public.talkx_settings
     WHERE key = 'dnd_hours';

    IF v_dnd_hours IS NOT NULL THEN
      DECLARE
        v_dnd_start time;
        v_dnd_end time;
        v_dnd_sundays boolean;
        v_dnd_holidays jsonb;
        v_today text;
        v_holiday text;
      BEGIN
        IF jsonb_typeof(v_dnd_hours) <> 'object' THEN
          RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
          RETURN;
        END IF;
        BEGIN
          v_dnd_start := NULLIF(v_dnd_hours ->> 'start', '')::time;
          v_dnd_end := NULLIF(v_dnd_hours ->> 'end', '')::time;
          v_dnd_sundays := COALESCE((v_dnd_hours ->> 'sundays')::boolean, false);
        EXCEPTION
          WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
            RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
            RETURN;
        END;

        -- start/end ausentes: fora do contrato → fecha (como o TS).
        IF v_dnd_start IS NULL OR v_dnd_end IS NULL THEN
          RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
          RETURN;
        END IF;

        -- sundays presente mas não-booleano: fora do contrato → fecha.
        IF (v_dnd_hours ? 'sundays')
           AND jsonb_typeof(v_dnd_hours -> 'sundays') <> 'boolean' THEN
          RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
          RETURN;
        END IF;

        -- Domingo só bloqueia quando o setting manda.
        IF v_dnd_sundays AND v_weekday = 0 THEN
          RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
          RETURN;
        END IF;

        -- Feriados do setting (ausente = []); item fora do formato fecha.
        v_dnd_holidays := COALESCE(v_dnd_hours -> 'holidays', '[]'::jsonb);
        IF jsonb_typeof(v_dnd_holidays) <> 'array' THEN
          RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
          RETURN;
        END IF;
        -- teto por chamada: um ano de feriados basta; acima disso fecha.
        IF jsonb_array_length(v_dnd_holidays) > 366 THEN
          RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
          RETURN;
        END IF;
        v_today := to_char(v_local_ts, 'YYYY-MM-DD');
        FOR v_holiday IN SELECT jsonb_array_elements_text(v_dnd_holidays)
        LOOP
          IF v_holiday !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN
            RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
            RETURN;
          END IF;
          IF v_holiday = v_today THEN
            RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
            RETURN;
          END IF;
        END LOOP;

        -- start..end, fim exclusivo; virando a meia-noite cobre os dois lados.
        v_start_minutes := EXTRACT(HOUR FROM v_dnd_start)::integer * 60
          + EXTRACT(MINUTE FROM v_dnd_start)::integer;
        v_end_minutes := EXTRACT(HOUR FROM v_dnd_end)::integer * 60
          + EXTRACT(MINUTE FROM v_dnd_end)::integer;
        IF v_start_minutes <= v_end_minutes THEN
          IF v_now_minutes >= v_start_minutes AND v_now_minutes < v_end_minutes THEN
            RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
            RETURN;
          END IF;
        ELSIF v_now_minutes >= v_start_minutes OR v_now_minutes < v_end_minutes THEN
          RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
          RETURN;
        END IF;
      END;
    END IF;
  END IF;

  -- 3) Janela de envio (send_window_start..send_window_end) — mesma lógica
  --    que talkx-send usa para pausar no mid-loop.
  IF v_campaign.send_window_start IS NOT NULL AND v_campaign.send_window_end IS NOT NULL THEN
    DECLARE
      v_window_start_minutes integer;
      v_window_end_minutes integer;
      v_current_minutes integer;
    BEGIN
      v_window_start_minutes := EXTRACT(HOUR FROM v_campaign.send_window_start)::integer * 60
        + EXTRACT(MINUTE FROM v_campaign.send_window_start)::integer;
      v_window_end_minutes := EXTRACT(HOUR FROM v_campaign.send_window_end)::integer * 60
        + EXTRACT(MINUTE FROM v_campaign.send_window_end)::integer;
      -- Hora local no fuso da campanha (ponto 2).
      v_current_minutes := v_now_minutes;

      IF v_current_minutes < v_window_start_minutes OR v_current_minutes >= v_window_end_minutes THEN
        RETURN QUERY SELECT false, 'outside_send_window', NULL::timestamptz;
        RETURN;
      END IF;
    END;
  END IF;

  -- 4) Business hours only — mesma lógica que talkx-window.ts (#121A):
  --    configuração AUSENTE = default 08:00–18:00, seg–sex, America/Sao_Paulo;
  --    configuração PRESENTE e fora do contrato = fecha (invalid_business_hours),
  --    nunca abre por engano nem estoura no cast de ::time.
  IF v_campaign.business_hours_only THEN
    DECLARE
      v_bh jsonb;
      v_bh_obj jsonb;
      v_bh_tz text;
      v_bh_start_min integer;
      v_bh_end_min integer;
      v_bh_days_arr smallint[];
      v_bh_dow smallint;
      v_bh_clock time;
      v_bh_now_min integer;
      v_elem jsonb;
      v_num numeric;
      v_invalid boolean := false;
    BEGIN
      SELECT value INTO v_bh
        FROM public.talkx_settings
       WHERE key = 'business_hours';

      -- Ausente / JSON null = não há configuração (default). String JSON é
      -- aceita como compatibilidade ("" = ausência; inválida = fora do contrato).
      IF v_bh IS NULL OR jsonb_typeof(v_bh) = 'null' THEN
        v_bh_obj := NULL;
      ELSIF jsonb_typeof(v_bh) = 'string' THEN
        IF btrim(v_bh #>> '{}') = '' THEN
          v_bh_obj := NULL;
        ELSE
          BEGIN
            v_bh_obj := (v_bh #>> '{}')::jsonb;
          EXCEPTION
            WHEN others THEN
              v_invalid := true;
          END;
        END IF;
      ELSE
        v_bh_obj := v_bh;
      END IF;

      IF NOT v_invalid AND v_bh_obj IS NOT NULL THEN
        IF jsonb_typeof(v_bh_obj) <> 'object' THEN
          v_invalid := true;
        ELSE
          -- start/end: "HH:MM" estrito (mesma regex do TS).
          IF COALESCE(v_bh_obj ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
             OR COALESCE(v_bh_obj ->> 'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
            v_invalid := true;
          END IF;

          -- days: chave presente, array não-vazio de inteiros 0..6 (0 = domingo).
          IF NOT v_invalid THEN
            IF (v_bh_obj -> 'days') IS NULL
               OR jsonb_typeof(v_bh_obj -> 'days') <> 'array' THEN
              v_invalid := true;
            ELSIF jsonb_array_length(v_bh_obj -> 'days') = 0 THEN
              v_invalid := true;
            ELSIF jsonb_array_length(v_bh_obj -> 'days') > 32 THEN
              -- teto por chamada: nunca há mais de 7 dias válidos (0..6).
              v_invalid := true;
            ELSE
              FOR v_elem IN SELECT * FROM jsonb_array_elements(v_bh_obj -> 'days')
              LOOP
                IF jsonb_typeof(v_elem) <> 'number' THEN
                  v_invalid := true;
                  EXIT;
                END IF;
                v_num := (v_elem #>> '{}')::numeric;
                IF v_num <> trunc(v_num) OR v_num < 0 OR v_num > 6 THEN
                  v_invalid := true;
                  EXIT;
                END IF;
                v_bh_days_arr := COALESCE(v_bh_days_arr, ARRAY[]::smallint[]) || v_num::smallint;
              END LOOP;
            END IF;
          END IF;
        END IF;
      END IF;

      IF v_invalid THEN
        RETURN QUERY SELECT false, 'invalid_business_hours', NULL::timestamptz;
        RETURN;
      END IF;

      -- Ausente = default 08:00–18:00, seg–sex, America/Sao_Paulo.
      IF v_bh_obj IS NULL THEN
        v_bh_start_min := 8 * 60;
        v_bh_end_min := 18 * 60;
        v_bh_days_arr := ARRAY[1, 2, 3, 4, 5]::smallint[];
        v_bh_tz := 'America/Sao_Paulo';
      ELSE
        v_bh_start_min := split_part(v_bh_obj ->> 'start', ':', 1)::integer * 60
          + split_part(v_bh_obj ->> 'start', ':', 2)::integer;
        v_bh_end_min := split_part(v_bh_obj ->> 'end', ':', 1)::integer * 60
          + split_part(v_bh_obj ->> 'end', ':', 2)::integer;
        v_bh_tz := COALESCE(NULLIF(btrim(v_bh_obj ->> 'tz'), ''), 'America/Sao_Paulo');
      END IF;

      -- Hora e dia no fuso do business_hours; fuso desconhecido fecha.
      BEGIN
        v_bh_clock := (p_at AT TIME ZONE v_bh_tz)::time;
        v_bh_dow := EXTRACT(DOW FROM p_at AT TIME ZONE v_bh_tz)::smallint;
      EXCEPTION
        WHEN invalid_parameter_value THEN
          RETURN QUERY SELECT false, 'invalid_business_hours', NULL::timestamptz;
          RETURN;
      END;
      v_bh_now_min := EXTRACT(HOUR FROM v_bh_clock)::integer * 60
        + EXTRACT(MINUTE FROM v_bh_clock)::integer;

      IF NOT (v_bh_dow = ANY(v_bh_days_arr))
         OR v_bh_now_min < v_bh_start_min
         OR v_bh_now_min >= v_bh_end_min THEN
        RETURN QUERY SELECT false, 'outside_business_hours', NULL::timestamptz;
        RETURN;
      END IF;
    END;
  END IF;

  -- Tudo passou: janela aberta.
  RETURN QUERY SELECT true, NULL::text, NULL::timestamptz;
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
  TO service_role;
