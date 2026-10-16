-- Talk X N-102 (defeito 2/4): a janela de envio passa a ser avaliada no fuso da campanha.
-- Rollback: devolve public.talkx_campaign_window_open ao SQL abaixo, que extraia dia da semana e hora de p_at cru (sem fuso).
-- Rollback (SQL executável, na ordem):
--   CREATE OR REPLACE FUNCTION public.talkx_campaign_window_open( p_campaign_id uuid, p_at timestamptz ) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$ DECLARE v_campaign public.talkx_campaigns%ROWTYPE; v_dnd_hours jsonb; v_weekday integer; v_start_minutes integer; v_end_minutes integer; v_minutes_of_day integer; BEGIN SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = p_campaign_id; IF NOT FOUND THEN RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002'; END IF; IF v_campaign.send_weekdays IS NOT NULL THEN v_weekday := EXTRACT(ISODOW FROM p_at)::integer % 7; IF NOT (v_weekday = ANY(v_campaign.send_weekdays)) THEN RETURN false; END IF; END IF; IF v_campaign.respect_dnd THEN SELECT value INTO v_dnd_hours FROM public.talkx_settings WHERE key = 'dnd_hours'; IF v_dnd_hours IS NOT NULL AND jsonb_typeof(v_dnd_hours) = 'object' THEN v_minutes_of_day := EXTRACT(HOUR FROM p_at)::integer * 60 + EXTRACT(MINUTE FROM p_at)::integer; v_start_minutes := (split_part(v_dnd_hours ->> 'start', ':', 1))::integer * 60 + (split_part(v_dnd_hours ->> 'start', ':', 2))::integer; v_end_minutes := (split_part(v_dnd_hours ->> 'end', ':', 1))::integer * 60 + (split_part(v_dnd_hours ->> 'end', ':', 2))::integer; IF EXTRACT(DOW FROM p_at) = 0 AND (v_dnd_hours ->> 'sundays')::boolean = false THEN RETURN true; END IF; IF jsonb_array_length(v_dnd_hours -> 'holidays') > 0 THEN IF p_at::date = ANY(v_dnd_hours -> 'holidays')::date[] THEN RETURN true; END IF; END IF; IF v_start_minutes < v_end_minutes THEN IF v_minutes_of_day >= v_start_minutes AND v_minutes_of_day < v_end_minutes THEN RETURN false; END IF; ELSIF v_start_minutes > v_end_minutes THEN IF v_minutes_of_day >= v_start_minutes OR v_minutes_of_day < v_end_minutes THEN RETURN false; END IF; END IF; END IF; END IF; RETURN true; END; $function$;
--
-- Antes, talkx_campaign_window_open extraia dia da semana (ISODOW) e hora do "nao
-- perturbe" direto de p_at (timestamptz, dado em UTC): uma campanha agendada para
-- segunda 09:00 em America/Sao_Paulo podia ser avaliada como domingo 23:30 ou cair
-- dentro/fora do DND na hora errada. Agora o instante e convertido UMA vez para o
-- fuso da campanha (coluna schedule_timezone, ja existente e NOT NULL desde
-- 20260911200000) e todas as extracoes saem da conversao (v_local_at).
--
-- Decisao registrada (sem inventar coluna nova): o fuso sai da propria campanha;
-- quando o valor nao for um nome IANA valido (linha legada anterior ao CHECK
-- ainda NAO VALIDADO de 20260911200000), cai no default historico
-- 'America/Sao_Paulo' pelo helper public.is_valid_talkx_schedule_timezone(text),
-- em vez de estourar erro de fuso na hora do envio.
--
-- Convencao UNICA de dia da semana, usada em todas as comparacoes desta funcao:
-- ISODOW (1=segunda..7=domingo) reduzido com % 7 UMA vez -> 0=domingo..6=sabado.
-- Esse mesmo numero (v_weekday) valida send_weekdays E o teste de domingo do DND;
-- EXTRACT(DOW) nao aparece em nenhum ponto desta funcao.

CREATE OR REPLACE FUNCTION public.talkx_campaign_window_open(
  p_campaign_id uuid,
  p_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_dnd_hours jsonb;
  v_timezone text;
  v_local_at timestamp;
  v_weekday integer;
  v_start_minutes integer;
  v_end_minutes integer;
  v_minutes_of_day integer;
BEGIN
  SELECT * INTO v_campaign
    FROM public.talkx_campaigns
   WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Fuso da campanha com fallback defensivo; toda extracao de dia/hora sai daqui.
  v_timezone := COALESCE(NULLIF(v_campaign.schedule_timezone, ''), 'America/Sao_Paulo');
  IF public.is_valid_talkx_schedule_timezone(v_timezone) IS NOT TRUE THEN
    v_timezone := 'America/Sao_Paulo';
  END IF;
  v_local_at := p_at AT TIME ZONE v_timezone;

  -- Dia da semana local calculado UMA vez, na convencao do array send_weekdays
  -- (ISODOW 1..7 -> % 7 -> 0=domingo..6=sabado), e reaproveitado pelo DND.
  v_weekday := EXTRACT(ISODOW FROM v_local_at)::integer % 7;

  -- send_weekdays: null = todos os dias; array = dias permitidos (0=dom, 6=sáb)
  IF v_campaign.send_weekdays IS NOT NULL THEN
    IF NOT (v_weekday = ANY(v_campaign.send_weekdays)) THEN
      RETURN false;
    END IF;
  END IF;

  -- DND: se respect_dnd=true, verifica se o instante local está dentro da janela de não perturbe
  IF v_campaign.respect_dnd THEN
    SELECT value INTO v_dnd_hours
      FROM public.talkx_settings
     WHERE key = 'dnd_hours';

    IF v_dnd_hours IS NOT NULL AND jsonb_typeof(v_dnd_hours) = 'object' THEN
      v_minutes_of_day := EXTRACT(HOUR FROM v_local_at)::integer * 60
                          + EXTRACT(MINUTE FROM v_local_at)::integer;
      v_start_minutes := (split_part(v_dnd_hours ->> 'start', ':', 1))::integer * 60
                         + (split_part(v_dnd_hours ->> 'start', ':', 2))::integer;
      v_end_minutes := (split_part(v_dnd_hours ->> 'end', ':', 1))::integer * 60
                       + (split_part(v_dnd_hours ->> 'end', ':', 2))::integer;

      -- domingo (v_weekday = 0, mesma convencao de send_weekdays): se sundays=false,
      -- o DND não aplica (janela aberta)
      IF v_weekday = 0 AND (v_dnd_hours ->> 'sundays')::boolean = false THEN
        RETURN true;
      END IF;

      -- feriados
      IF jsonb_array_length(v_dnd_hours -> 'holidays') > 0 THEN
        IF v_local_at::date = ANY(v_dnd_hours -> 'holidays')::date[] THEN
          RETURN true;
        END IF;
      END IF;

      -- Janela DND: se start < end, verifica se está dentro; se start > end (cruza meia-noite), verifica se está fora do intervalo permitido
      IF v_start_minutes < v_end_minutes THEN
        IF v_minutes_of_day >= v_start_minutes AND v_minutes_of_day < v_end_minutes THEN
          RETURN false;
        END IF;
      ELSIF v_start_minutes > v_end_minutes THEN
        IF v_minutes_of_day >= v_start_minutes OR v_minutes_of_day < v_end_minutes THEN
          RETURN false;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN true;
END;
$function$;
