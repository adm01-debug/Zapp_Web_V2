-- talkx_engine_window_contract
-- Rollback: recria public.talkx_engine_window_open(uuid) com o corpo, os GRANTs e o comentario anteriores (bloco "Rollback (completo)" abaixo e executavel).
-- #121B: a funcao de saude public.talkx_engine_window_open(uuid) dizia espelhar
-- deliveryWindowStatus() (supabase/functions/_shared/talkx-window.ts), mas avaliava
-- o business_hours no fuso da CAMPANHA e nao validava o JSONB presente — valor
-- malformado podia abrir a janela (ou derrubar a funcao com excecao) enquanto o
-- sender e o scheduler a fecham. Este CREATE OR REPLACE alinha a saude ao contrato:
--   * send_window_* segue avaliado no fuso da campanha (schedule_timezone);
--   * business_hours e avaliado no fuso PROPRIO do JSONB (tz); ausente/nulo, o
--     fuso comercial e America/Sao_Paulo;
--   * ausencia da configuracao usa o default 08:00-18:00, seg-sex, America/Sao_Paulo;
--   * JSONB presente e invalido (hora, fuso, dias ou tipo fora do contrato) FECHA a
--     janela — sem excecao e sem cair silenciosamente no default (nunca falha aberta);
--   * campanha sem schedule_timezone valido tambem fecha (invalid_schedule_timezone).
-- Rollback (completo; para executar, remova o prefixo "-- > " de cada linha):
-- > CREATE OR REPLACE FUNCTION public.talkx_engine_window_open(p_campaign_id uuid)
-- > RETURNS boolean
-- > LANGUAGE plpgsql
-- > STABLE
-- > SECURITY DEFINER
-- > SET search_path = public, pg_temp
-- > AS $function$
-- > DECLARE
-- >   v_tz         text;
-- >   v_start      time;
-- >   v_end        time;
-- >   v_bh_only    boolean;
-- >   v_local      timestamp;
-- >   v_min        integer;
-- >   v_bh         jsonb;
-- >   v_days       jsonb;
-- >   v_bstart     text;
-- >   v_bend       text;
-- >   v_bstart_min integer;
-- >   v_bend_min   integer;
-- >   v_dow        integer;
-- > BEGIN
-- >   SELECT COALESCE(NULLIF(c.schedule_timezone, ''), 'America/Sao_Paulo'),
-- >          c.send_window_start,
-- >          c.send_window_end,
-- >          COALESCE(c.business_hours_only, false)
-- >     INTO v_tz, v_start, v_end, v_bh_only
-- >     FROM public.talkx_campaigns AS c
-- >    WHERE c.id = p_campaign_id;
-- >   IF NOT FOUND THEN
-- >     RETURN false;
-- >   END IF;
-- >
-- >   v_local := (now() AT TIME ZONE v_tz);
-- >   v_min := EXTRACT(hour FROM v_local)::integer * 60 + EXTRACT(minute FROM v_local)::integer;
-- >
-- >   IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
-- >     IF v_min < EXTRACT(hour FROM v_start)::integer * 60 + EXTRACT(minute FROM v_start)::integer
-- >        OR v_min >= EXTRACT(hour FROM v_end)::integer * 60 + EXTRACT(minute FROM v_end)::integer THEN
-- >       RETURN false;
-- >     END IF;
-- >   END IF;
-- >
-- >   IF v_bh_only THEN
-- >     SELECT s.value INTO v_bh FROM public.talkx_settings AS s WHERE s.key = 'business_hours';
-- >     v_days := COALESCE(v_bh -> 'days', '[1,2,3,4,5]'::jsonb);
-- >     v_bstart := COALESCE(v_bh ->> 'start', '08:00');
-- >     v_bend := COALESCE(v_bh ->> 'end', '18:00');
-- >     v_dow := EXTRACT(dow FROM v_local)::integer;
-- >     IF NOT (v_days @> to_jsonb(v_dow)) THEN
-- >       RETURN false;
-- >     END IF;
-- >     v_bstart_min := split_part(v_bstart, ':', 1)::integer * 60 + split_part(v_bstart, ':', 2)::integer;
-- >     v_bend_min := split_part(v_bend, ':', 1)::integer * 60 + split_part(v_bend, ':', 2)::integer;
-- >     IF v_min < v_bstart_min OR v_min >= v_bend_min THEN
-- >       RETURN false;
-- >     END IF;
-- >   END IF;
-- >
-- >   RETURN true;
-- > END;
-- > $function$;
-- >
-- > REVOKE ALL ON FUNCTION public.talkx_engine_window_open(uuid) FROM PUBLIC, anon;
-- > GRANT EXECUTE ON FUNCTION public.talkx_engine_window_open(uuid) TO authenticated, service_role;
-- >
-- > COMMENT ON FUNCTION public.talkx_engine_window_open(uuid) IS
-- >   'X033: a janela de entrega da campanha esta aberta agora? Mesma semantica de deliveryWindowStatus() (fuso, send_window_*, business_hours). Fecha em entrada invalida.';
-- Fim do rollback.

CREATE OR REPLACE FUNCTION public.talkx_engine_window_open(p_campaign_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_tz         text;
  v_tz_name    text;
  v_start      time;
  v_end        time;
  v_bh_only    boolean;
  v_local      timestamp;
  v_min        integer;
  v_bh         jsonb;
  v_bh_text    text;
  v_days       jsonb;
  v_bstart     text;
  v_bend       text;
  v_bstart_min integer;
  v_bend_min   integer;
  v_btz        text;
  v_btz_name   text;
  v_bh_local   timestamp;
  v_bh_min     integer;
  v_bh_dow     integer;
BEGIN
  SELECT c.schedule_timezone,
         c.send_window_start,
         c.send_window_end,
         COALESCE(c.business_hours_only, false)
    INTO v_tz, v_start, v_end, v_bh_only
    FROM public.talkx_campaigns AS c
   WHERE c.id = p_campaign_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Fuso da campanha: ausente (NULL) cai no default, como o edge trata tipo
  -- nao-string; valor presente fora de pg_timezone_names fecha a janela
  -- (invalid_schedule_timezone) em vez de estourar excecao em AT TIME ZONE.
  IF v_tz IS NULL THEN
    v_tz_name := 'America/Sao_Paulo';
  ELSE
    SELECT timezone.name INTO v_tz_name
      FROM pg_timezone_names AS timezone
     WHERE lower(timezone.name) = lower(v_tz)
     LIMIT 1;
    IF v_tz_name IS NULL THEN
      RETURN false;
    END IF;
  END IF;

  BEGIN
    v_local := now() AT TIME ZONE v_tz_name;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  v_min := EXTRACT(hour FROM v_local)::integer * 60
         + EXTRACT(minute FROM v_local)::integer;

  IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
    IF v_min < EXTRACT(hour FROM v_start)::integer * 60 + EXTRACT(minute FROM v_start)::integer
       OR v_min >= EXTRACT(hour FROM v_end)::integer * 60 + EXTRACT(minute FROM v_end)::integer THEN
      RETURN false;
    END IF;
  END IF;

  IF v_bh_only THEN
    SELECT s.value INTO v_bh FROM public.talkx_settings AS s WHERE s.key = 'business_hours';

    -- Compatibilidade aceita pelo edge (parseBusinessHours): value JSONB contendo
    -- uma STRING e lida como JSON em texto. String vazia = ausencia; string que
    -- nao e JSON, ou que decodifica para nao-objeto, e invalida e fecha.
    IF jsonb_typeof(v_bh) = 'string' THEN
      v_bh_text := btrim(v_bh #>> '{}');
      IF v_bh_text = '' THEN
        v_bh := NULL;
      ELSE
        BEGIN
          v_bh := v_bh_text::jsonb;
        EXCEPTION WHEN OTHERS THEN
          RETURN false;
        END;
        -- "null" em texto decodifica, mas para o normalize do edge e valor
        -- ausente DENTRO de uma string presente: invalido, fecha a janela.
        IF jsonb_typeof(v_bh) = 'null' THEN
          RETURN false;
        END IF;
      END IF;
    END IF;

    IF v_bh IS NULL OR jsonb_typeof(v_bh) = 'null' THEN
      -- Ausencia da configuracao: default historico 08:00-18:00, seg-sex,
      -- avaliado em America/Sao_Paulo (nao no fuso da campanha).
      v_bstart_min := 8 * 60;
      v_bend_min   := 18 * 60;
      v_days       := '[1,2,3,4,5]'::jsonb;
      v_btz_name   := 'America/Sao_Paulo';
    ELSE
      -- Presente: o contrato canonico {start,end,tz,days} e validado por inteiro;
      -- qualquer desvio fecha a janela, nunca cai no default.
      IF jsonb_typeof(v_bh) IS DISTINCT FROM 'object' THEN
        RETURN false;
      END IF;
      IF jsonb_typeof(v_bh -> 'start') IS DISTINCT FROM 'string'
         OR btrim(v_bh ->> 'start') !~ '^([01][0-9]|2[0-3]):([0-5][0-9])$' THEN
        RETURN false;
      END IF;
      IF jsonb_typeof(v_bh -> 'end') IS DISTINCT FROM 'string'
         OR btrim(v_bh ->> 'end') !~ '^([01][0-9]|2[0-3]):([0-5][0-9])$' THEN
        RETURN false;
      END IF;
      v_days := v_bh -> 'days';
      IF jsonb_typeof(v_days) IS DISTINCT FROM 'array'
         OR jsonb_array_length(v_days) = 0
         OR EXISTS (
              SELECT 1
                FROM jsonb_array_elements(v_days) AS dia
               WHERE CASE
                       WHEN jsonb_typeof(dia.value) IS DISTINCT FROM 'number' THEN true
                       ELSE (dia.value #>> '{}')::numeric < 0
                         OR (dia.value #>> '{}')::numeric > 6
                         OR (dia.value #>> '{}')::numeric
                            <> trunc((dia.value #>> '{}')::numeric)
                     END
            ) THEN
        RETURN false;
      END IF;
      -- tz proprio do business_hours: chave ausente ou nula -> Sao_Paulo;
      -- presente e invalido (vazio, nao-string, nome desconhecido) -> fecha.
      IF v_bh -> 'tz' IS NULL OR jsonb_typeof(v_bh -> 'tz') = 'null' THEN
        v_btz_name := 'America/Sao_Paulo';
      ELSIF jsonb_typeof(v_bh -> 'tz') IS DISTINCT FROM 'string' THEN
        RETURN false;
      ELSE
        v_btz := btrim(v_bh ->> 'tz');
        SELECT timezone.name INTO v_btz_name
          FROM pg_timezone_names AS timezone
         WHERE lower(timezone.name) = lower(v_btz)
         LIMIT 1;
        IF v_btz_name IS NULL THEN
          RETURN false;
        END IF;
      END IF;
      v_bstart := btrim(v_bh ->> 'start');
      v_bend   := btrim(v_bh ->> 'end');
      v_bstart_min := split_part(v_bstart, ':', 1)::integer * 60
                    + split_part(v_bstart, ':', 2)::integer;
      v_bend_min   := split_part(v_bend, ':', 1)::integer * 60
                    + split_part(v_bend, ':', 2)::integer;
    END IF;

    -- O relogio do horario comercial e o do fuso do business_hours (#121A),
    -- nao o da campanha: dias e horas sao medidos nesse relogio.
    BEGIN
      v_bh_local := now() AT TIME ZONE v_btz_name;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;
    v_bh_min := EXTRACT(hour FROM v_bh_local)::integer * 60
              + EXTRACT(minute FROM v_bh_local)::integer;
    v_bh_dow := EXTRACT(dow FROM v_bh_local)::integer;

    IF NOT (v_days @> to_jsonb(v_bh_dow))
       OR v_bh_min < v_bstart_min
       OR v_bh_min >= v_bend_min THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_engine_window_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_engine_window_open(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_engine_window_open(uuid) IS
  '#121B: a janela de entrega da campanha esta aberta agora? Mesma semantica de deliveryWindowStatus(): send_window_* no fuso da campanha; business_hours no tz proprio do JSONB (default 08:00-18:00 seg-sex America/Sao_Paulo na ausencia). Fecha em entrada invalida, sem excecao.';
