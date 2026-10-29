-- Rollback: remove a funcao talkx_campaign_window_open criada por esta migration (fatia c do N-102); sem dados nem ACL de objeto pre-existente a reverter.
-- Rollback (SQL executavel, na ordem):
--   DROP FUNCTION IF EXISTS public.talkx_campaign_window_open(uuid, timestamptz);
--
-- N-102c (fatia de banco, split do t_25061962 recusado por diff de 90098 chars).
-- Cria SOMENTE public.talkx_campaign_window_open, corrigida em 3 pontos:
--   (a) le o schedule_timezone da campanha e converte p_at UMA vez com AT TIME ZONE,
--       avaliando hora e dia da semana no horario local da campanha — antes usava o
--       fuso da sessao (Supabase = UTC);
--   (b) usa EXTRACT(DOW ...) de ponta a ponta (0=domingo .. 6=sabado), coerente com o
--       dicionario de send_weekdays — antes misturava ISODOW (1=segunda .. 7=domingo)
--       com o dicionario, deslocando o dia em 1;
--   (c) restringe o acesso: REVOKE de PUBLIC/anon/authenticated e EXECUTE so para
--       service_role — antes a RPC era executavel por authenticated. Fecha tambem o
--       check-secdef-public-execute (SECURITY DEFINER de public sem PUBLIC/anon).
-- Nao toca DDL/colunas (fatia a), nem os casts de draft/limits (fatia b), nem o
-- default do setting dnd_hours. Sem BEGIN/COMMIT (o ledger aplica cada migration em
-- transacao propria).
--
-- Corpo copiado de 20261010124150_talkx_n102_window_fixes.sql (commit 2c186a480),
-- SOMENTE a funcao talkx_campaign_window_open (o arquivo de origem tem outras 2 RPCs
-- e o DDL, que vieram nas fatias a e b).

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
  v_local_date date;
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

  -- Fuso da campanha: weekday, feriados e DND sao avaliados no horario local do
  -- schedule_timezone, nunca no fuso da sessao (Supabase = UTC). Mesmo fallback de
  -- save_talkx_campaign_draft.
  v_timezone := COALESCE(NULLIF(btrim(COALESCE(v_campaign.schedule_timezone, '')), ''), 'America/Sao_Paulo');
  v_local_at := p_at AT TIME ZONE v_timezone;
  v_local_date := v_local_at::date;

  -- send_weekdays: null = todos os dias; array = dias permitidos (0=domingo .. 6=sabado)
  IF v_campaign.send_weekdays IS NOT NULL THEN
    v_weekday := EXTRACT(DOW FROM v_local_at)::integer;
    IF NOT (v_weekday = ANY(v_campaign.send_weekdays)) THEN
      RETURN false;
    END IF;
  END IF;

  -- DND: se respect_dnd=true, verifica se o horario local esta na janela de nao perturbe
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

      -- domingo: se sundays=false, DND nao aplica (janela aberta)
      IF EXTRACT(DOW FROM v_local_at) = 0 AND (v_dnd_hours ->> 'sundays')::boolean = false THEN
        RETURN true;
      END IF;

      -- feriados: comparados por data local, sem cast jsonb -> date[]
      IF jsonb_array_length(v_dnd_hours -> 'holidays') > 0 THEN
        IF v_local_date::text = ANY(ARRAY(SELECT jsonb_array_elements_text(v_dnd_hours -> 'holidays'))) THEN
          RETURN true;
        END IF;
      END IF;

      -- Janela DND: se start < end, verifica se esta dentro; se start > end (cruza
      -- meia-noite), verifica se esta fora do intervalo permitido
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

REVOKE ALL ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
  TO service_role;
