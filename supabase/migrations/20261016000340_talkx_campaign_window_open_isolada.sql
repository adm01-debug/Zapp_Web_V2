-- N-118 isolada ([refazer 2] t_8f7e8008): sobe APENAS a janela Talk X ja corrigida,
-- no contrato BOOLEAN que o motor consome.
-- Rollback: dropa a funcao BOOLEAN criada aqui; as colunas da janela FICAM (ver abaixo).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.talkx_campaign_window_open(uuid, timestamptz);
-- -- O que este rollback desfaz: apenas a funcao BOOLEAN criada aqui. As colunas
-- -- send_weekdays e respect_dnd nao sao dropadas: num alvo que ja recebeu a migration
-- -- 20261011000003 as duas sao dela, e dropa-las apagaria dado daquela migration.
-- -- Esta migration so as cria por contingencia (ADD COLUMN IF NOT EXISTS) para a
-- -- funcao ter o que ler. Num alvo em que SO esta migration as criou, o rollback
-- -- total e (apaga os dados das duas colunas, por isso nao e o caminho padrao):
--   alter table public.talkx_campaigns drop column if exists send_weekdays;
--   alter table public.talkx_campaigns drop column if exists respect_dnd;
-- -- Para voltar ao contrato TABLE anterior (migration 20261011000003): o DROP acima
-- -- remove o obstaculo (42P13) e reexecutar aquela migration recria a funcao TABLE
-- -- sem tocar nas colunas.
-- Troca de contrato: a versao anterior da funcao tem a MESMA assinatura de entrada
-- (p_campaign_id uuid, p_at timestamptz) e retorno TABLE(allowed boolean, reason text,
-- next_window timestamptz) — por isso o DROP FUNCTION antes do CREATE OR REPLACE:
-- sem o DROP, o CREATE OR REPLACE falha com 42P13 (cannot change return type of
-- existing function). O teste versionado prova os dois lados.
-- Direto em public.talkx_campaigns (sem _legacy, sem reescrever save/update).
-- Contrato BOOLEAN: TRUE = janela aberta. O motor (talkx-scheduler) consome
-- `windowOpen !== true` como fora-da-janela, entao FALSE e erro fecham (skip).
-- Colunas irrelevantes (status etc.) sao ignoradas: so as janelas decidem.
-- Origens lidas aqui (faltavam no DDL avulso): talkx_settings.dnd_hours e
-- talkx_settings.business_hours. Cast jsonb por conversao NULL-explicita
-- (nunca cast direto do valor bruto); days invalido = erro 22023
-- (invalid_business_hours), nunca 22P02/42846.
-- Ramos TRUE: send_window com start=end (open 24h) e campanha sem restricao
-- (so existir/active) — ambos TRUE.

-- 1) Colunas da janela (so as que a funcao le).
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS send_weekdays smallint[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS respect_dnd boolean NOT NULL DEFAULT true;

-- 2) Janela de envio por campanha (fuso dela; DND so com opt-in; BH no fuso proprio).
-- O contrato anterior da MESMA assinatura era TABLE(allowed, reason, next_window)
-- (migration 20261011000003): sem o DROP da linha seguinte, o CREATE OR REPLACE
-- falha com 42P13 (cannot change return type of existing function). A assinatura de
-- entrada e a mesma, entao nada mais depende dela.
DROP FUNCTION IF EXISTS public.talkx_campaign_window_open(uuid, timestamptz);
CREATE OR REPLACE FUNCTION public.talkx_campaign_window_open(
  p_campaign_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_tz text;
  v_send_start time;
  v_send_end time;
  v_bh_only boolean;
  v_weekdays smallint[];
  v_respect_dnd boolean;
  v_local_ts timestamp;
  v_weekday smallint;
  v_now_min integer;
  v_dnd jsonb;
  v_bh jsonb;
BEGIN
  -- So colunas da janela; status e demais colunas sao irrelevantes aqui.
  SELECT c.schedule_timezone, c.send_window_start, c.send_window_end,
         c.business_hours_only, c.send_weekdays, c.respect_dnd
    INTO v_tz, v_send_start, v_send_end, v_bh_only, v_weekdays, v_respect_dnd
    FROM public.talkx_campaigns AS c
   WHERE c.id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Fuso da campanha; invalido fecha.
  BEGIN
    v_tz := COALESCE(NULLIF(btrim(v_tz), ''), 'America/Sao_Paulo');
    v_local_ts := p_at AT TIME ZONE v_tz;
  EXCEPTION
    WHEN invalid_parameter_value THEN
      RETURN false;
  END;
  v_weekday := EXTRACT(DOW FROM v_local_ts)::smallint;
  v_now_min := EXTRACT(HOUR FROM v_local_ts)::integer * 60
    + EXTRACT(MINUTE FROM v_local_ts)::integer;

  -- send_weekdays: NULL = todos os dias; fora da lista fecha.
  IF v_weekdays IS NOT NULL AND NOT (v_weekday = ANY(v_weekdays)) THEN
    RETURN false;
  END IF;

  -- send_window: start=end = open 24h (TRUE); so um lado presente = ignora,
  -- como o motor; fora de [start,end) fecha (fim exclusivo).
  IF v_send_start IS NOT NULL AND v_send_end IS NOT NULL
     AND v_send_start IS DISTINCT FROM v_send_end THEN
    DECLARE
      v_start_min integer := EXTRACT(HOUR FROM v_send_start)::integer * 60
        + EXTRACT(MINUTE FROM v_send_start)::integer;
      v_end_min integer := EXTRACT(HOUR FROM v_send_end)::integer * 60
        + EXTRACT(MINUTE FROM v_send_end)::integer;
      v_cur_min integer := v_now_min;
    BEGIN
      IF v_end_min > v_start_min THEN
        IF v_cur_min < v_start_min OR v_cur_min >= v_end_min THEN
          RETURN false;
        END IF;
      ELSE
        -- Janela que vira a meia-noite cobre os dois lados.
        IF v_cur_min < v_start_min AND v_cur_min >= v_end_min THEN
          RETURN false;
        END IF;
      END IF;
    END;
  END IF;

  -- business_hours (so quando business_hours_only): ausente = default
  -- 08:00-18:00 seg-sex America/Sao_Paulo; presente e fora do contrato = 22023.
  IF COALESCE(v_bh_only, false) THEN
    SELECT value INTO v_bh FROM public.talkx_settings WHERE key = 'business_hours';
    DECLARE
      v_bh_obj jsonb;
      v_bh_tz text := 'America/Sao_Paulo';
      v_bh_start_min integer := 8 * 60;
      v_bh_end_min integer := 18 * 60;
      v_bh_days smallint[] := ARRAY[1, 2, 3, 4, 5]::smallint[];
      v_bh_clock time;
      v_bh_dow smallint;
      v_bh_now integer;
      v_elem jsonb;
      v_day integer;
      v_text text;
    BEGIN
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
              RAISE EXCEPTION 'invalid_business_hours' USING ERRCODE = '22023';
          END;
        END IF;
      ELSE
        v_bh_obj := v_bh;
      END IF;

      IF v_bh_obj IS NOT NULL THEN
        IF jsonb_typeof(v_bh_obj) <> 'object' THEN
          RAISE EXCEPTION 'invalid_business_hours' USING ERRCODE = '22023';
        END IF;
        IF COALESCE(v_bh_obj ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           OR COALESCE(v_bh_obj ->> 'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
          RAISE EXCEPTION 'invalid_business_hours' USING ERRCODE = '22023';
        END IF;
        -- days: presente, array nao-vazio; cada elemento por conversao
        -- NULL-explicita (nunca cast direto do bruto) — invalido = 22023.
        IF (v_bh_obj -> 'days') IS NULL
           OR jsonb_typeof(v_bh_obj -> 'days') <> 'array'
           OR jsonb_array_length(v_bh_obj -> 'days') = 0
           OR jsonb_array_length(v_bh_obj -> 'days') > 32 THEN
          RAISE EXCEPTION 'invalid_business_hours' USING ERRCODE = '22023';
        END IF;
        v_bh_days := ARRAY[]::smallint[];
        FOR v_elem IN SELECT * FROM jsonb_array_elements(v_bh_obj -> 'days')
        LOOP
          IF jsonb_typeof(v_elem) = 'null' THEN
            RAISE EXCEPTION 'invalid_business_hours' USING ERRCODE = '22023';
          END IF;
          v_text := btrim(v_elem #>> '{}');
          IF v_text = '' THEN
            RAISE EXCEPTION 'invalid_business_hours' USING ERRCODE = '22023';
          END IF;
          BEGIN
            v_day := v_text::integer;
          EXCEPTION
            WHEN invalid_text_representation OR numeric_value_out_of_range THEN
              RAISE EXCEPTION 'invalid_business_hours' USING ERRCODE = '22023';
          END;
          IF v_day < 0 OR v_day > 6 THEN
            RAISE EXCEPTION 'invalid_business_hours' USING ERRCODE = '22023';
          END IF;
          IF NOT (v_day::smallint = ANY(v_bh_days)) THEN
            v_bh_days := v_bh_days || v_day::smallint;
          END IF;
        END LOOP;
        v_bh_start_min := split_part(v_bh_obj ->> 'start', ':', 1)::integer * 60
          + split_part(v_bh_obj ->> 'start', ':', 2)::integer;
        v_bh_end_min := split_part(v_bh_obj ->> 'end', ':', 1)::integer * 60
          + split_part(v_bh_obj ->> 'end', ':', 2)::integer;
        v_bh_tz := COALESCE(NULLIF(btrim(v_bh_obj ->> 'tz'), ''), 'America/Sao_Paulo');
      END IF;

      BEGIN
        v_bh_clock := (p_at AT TIME ZONE v_bh_tz)::time;
        v_bh_dow := EXTRACT(DOW FROM p_at AT TIME ZONE v_bh_tz)::smallint;
      EXCEPTION
        WHEN invalid_parameter_value THEN
          RAISE EXCEPTION 'invalid_business_hours' USING ERRCODE = '22023';
      END;
      v_bh_now := EXTRACT(HOUR FROM v_bh_clock)::integer * 60
        + EXTRACT(MINUTE FROM v_bh_clock)::integer;

      IF NOT (v_bh_dow = ANY(v_bh_days))
         OR v_bh_now < v_bh_start_min
         OR v_bh_now >= v_bh_end_min THEN
        RETURN false;
      END IF;
    END;
  END IF;

  -- DND (opt-in por campanha; default true): ausente = sem DND; presente e
  -- fora do contrato ou ativo fecha. Fim exclusivo; vira-meia-noite cobre
  -- os dois lados; start=end = DND vazio (nunca ativo).
  IF COALESCE(v_respect_dnd, true) THEN
    SELECT value INTO v_dnd FROM public.talkx_settings WHERE key = 'dnd_hours';
    IF v_dnd IS NOT NULL THEN
      DECLARE
        v_dnd_start time;
        v_dnd_end time;
        v_dnd_sundays boolean := false;
        v_dnd_holidays jsonb := '[]'::jsonb;
        v_today text;
        v_hol jsonb;
        v_hol_text text;
        v_start_min integer;
        v_end_min integer;
      BEGIN
        IF jsonb_typeof(v_dnd) <> 'object' THEN
          RETURN false;
        END IF;
        BEGIN
          v_dnd_start := CASE WHEN btrim(COALESCE(v_dnd ->> 'start', '')) = ''
            THEN NULL ELSE (v_dnd ->> 'start')::time END;
          v_dnd_end := CASE WHEN btrim(COALESCE(v_dnd ->> 'end', '')) = ''
            THEN NULL ELSE (v_dnd ->> 'end')::time END;
        EXCEPTION
          WHEN invalid_text_representation OR invalid_datetime_format
            OR datetime_field_overflow THEN
            RETURN false;
        END;
        IF v_dnd_start IS NULL OR v_dnd_end IS NULL THEN
          RETURN false;
        END IF;
        IF (v_dnd ? 'sundays') AND jsonb_typeof(v_dnd -> 'sundays') <> 'boolean' THEN
          RETURN false;
        END IF;
        v_dnd_sundays := COALESCE((v_dnd ->> 'sundays')::boolean, false);
        IF v_dnd_sundays AND v_weekday = 0 THEN
          RETURN false;
        END IF;
        v_dnd_holidays := COALESCE(v_dnd -> 'holidays', '[]'::jsonb);
        IF jsonb_typeof(v_dnd_holidays) <> 'array'
           OR jsonb_array_length(v_dnd_holidays) > 366 THEN
          RETURN false;
        END IF;
        v_today := to_char(v_local_ts, 'YYYY-MM-DD');
        FOR v_hol IN SELECT * FROM jsonb_array_elements(v_dnd_holidays)
        LOOP
          v_hol_text := btrim(v_hol #>> '{}');
          IF v_hol_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
            RETURN false;
          END IF;
          IF v_hol_text = v_today THEN
            RETURN false;
          END IF;
        END LOOP;
        IF v_dnd_start IS DISTINCT FROM v_dnd_end THEN
          v_start_min := EXTRACT(HOUR FROM v_dnd_start)::integer * 60
            + EXTRACT(MINUTE FROM v_dnd_start)::integer;
          v_end_min := EXTRACT(HOUR FROM v_dnd_end)::integer * 60
            + EXTRACT(MINUTE FROM v_dnd_end)::integer;
          IF v_end_min > v_start_min THEN
            IF v_now_min >= v_start_min AND v_now_min < v_end_min THEN
              RETURN false;
            END IF;
          ELSIF v_now_min >= v_start_min OR v_now_min < v_end_min THEN
            RETURN false;
          END IF;
        END IF;
      END;
    END IF;
  END IF;

  RETURN true;
END;
$function$;

-- Um GRANT so: o motor chama com service_role; mais ninguem executa.
REVOKE ALL ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
  TO service_role;
