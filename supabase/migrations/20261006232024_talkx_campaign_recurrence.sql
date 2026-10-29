-- talkx_campaign_recurrence
-- Rollback: remove a RPC, o trigger de guarda e as colunas de recorrencia (na ordem abaixo).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.schedule_next_talkx_recurrence(uuid);
--   drop trigger if exists guard_talkx_campaign_recurrence_series on public.talkx_campaigns;
--   drop function if exists public.guard_talkx_campaign_recurrence_series();
--   drop index if exists public.idx_talkx_campaigns_recurrence_pending;
--   drop index if exists public.idx_talkx_campaigns_recurrence_series;
--   alter table public.talkx_campaigns drop constraint if exists talkx_campaigns_recurrence_shape_check;
--   alter table public.talkx_campaigns drop column if exists recurrence_closed_reason, drop column if exists recurrence_closed_at, drop column if exists recurrence_next_campaign_id, drop column if exists recurrence_series_id, drop column if exists recurrence_end_at, drop column if exists recurrence_weekdays, drop column if exists recurrence_frequency;
--
-- Talk X · recorrencia de campanha (cartao t_c1904679, Onda 3.6 do redesign).
-- Primeira entrega: SO "Diariamente" e "Semanalmente". "Personalizado" nao existe aqui.
--
-- Modelo: cada ocorrencia e UMA campanha (linha de talkx_campaigns). Quando uma
-- ocorrencia chega a 'completed', o talkx-scheduler chama
-- schedule_next_talkx_recurrence(id), que CLONA a campanha como 'scheduled' na
-- proxima data da serie. A serie e identificada por recurrence_series_id (a primeira
-- ocorrencia fica com NULL e a serie dela e o proprio id).
--
-- Dedup (anti-reenvio): a nova ocorrencia reavalia os MESMOS segmentos e subtrai todo
-- contato que ja "recebeu" em QUALQUER ocorrencia anterior da serie. "Recebeu" = o
-- destinatario esta em sending, sent, delivered ou outcome_unknown (pode ter saido
-- mensagem). Nao contam: pending, failed (falha definitiva), skipped e cancelled
-- (nada foi enviado).
--
-- Parar a serie: so uma ocorrencia 'completed' gera a proxima; pausada, cancelada,
-- rascunho ou em envio nao reagendam. Cancelar a proxima ocorrencia ja agendada
-- tambem encerra a serie (ela nunca completa).
--
-- Classe: ADITIVA (colunas anuladas, 1 trigger de guarda, 1 RPC service_role).
-- Idempotente/replayavel.

-- 1. Colunas -------------------------------------------------------------------
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS recurrence_frequency text,
  ADD COLUMN IF NOT EXISTS recurrence_weekdays smallint[],
  ADD COLUMN IF NOT EXISTS recurrence_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_series_id uuid,
  ADD COLUMN IF NOT EXISTS recurrence_next_campaign_id uuid REFERENCES public.talkx_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrence_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_closed_reason text;

COMMENT ON COLUMN public.talkx_campaigns.recurrence_frequency IS
  'Talk X: NULL = nao repete; daily | weekly. "Personalizado" ainda nao existe.';
COMMENT ON COLUMN public.talkx_campaigns.recurrence_weekdays IS
  'Talk X: dias da semana da recorrencia semanal (0 = domingo ... 6 = sabado, como extract(dow)). Obrigatorio em weekly, NULL em daily.';
COMMENT ON COLUMN public.talkx_campaigns.recurrence_end_at IS
  'Talk X: instante limite da serie; ocorrencia que cairia depois dele nao e criada. NULL = sem data de termino.';
COMMENT ON COLUMN public.talkx_campaigns.recurrence_series_id IS
  'Talk X: serie da ocorrencia (id da primeira campanha). NULL na primeira. Gravado so por schedule_next_talkx_recurrence.';
COMMENT ON COLUMN public.talkx_campaigns.recurrence_next_campaign_id IS
  'Talk X: ocorrencia seguinte ja criada a partir desta. Garante uma unica sucessora por ocorrencia.';
COMMENT ON COLUMN public.talkx_campaigns.recurrence_closed_at IS
  'Talk X: instante em que a serie foi encerrada a partir desta ocorrencia (sem sucessora).';
COMMENT ON COLUMN public.talkx_campaigns.recurrence_closed_reason IS
  'Talk X: series_ended | audience_exhausted | owner_inactive.';

ALTER TABLE public.talkx_campaigns
  DROP CONSTRAINT IF EXISTS talkx_campaigns_recurrence_shape_check;
ALTER TABLE public.talkx_campaigns
  ADD CONSTRAINT talkx_campaigns_recurrence_shape_check CHECK (
    (recurrence_frequency IS NULL
       AND recurrence_weekdays IS NULL)
    OR (recurrence_frequency = 'daily'
       AND recurrence_weekdays IS NULL)
    OR (recurrence_frequency = 'weekly'
       AND recurrence_weekdays IS NOT NULL
       AND cardinality(recurrence_weekdays) BETWEEN 1 AND 7
       AND recurrence_weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
  ) NOT VALID;
ALTER TABLE public.talkx_campaigns
  VALIDATE CONSTRAINT talkx_campaigns_recurrence_shape_check;

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_recurrence_pending
  ON public.talkx_campaigns (completed_at)
  WHERE recurrence_frequency IS NOT NULL
    AND status = 'completed'
    AND recurrence_next_campaign_id IS NULL
    AND recurrence_closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_recurrence_series
  ON public.talkx_campaigns (recurrence_series_id)
  WHERE recurrence_series_id IS NOT NULL;

-- 2. Guarda: o cliente nao mexe nas colunas de controle da serie ------------------
-- O operador grava frequencia/dias/termino pelo UPDATE normal da tela; serie, sucessora
-- e encerramento so a RPC (service_role) escreve.
CREATE OR REPLACE FUNCTION public.guard_talkx_campaign_recurrence_series()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.recurrence_series_id IS NOT NULL
         OR NEW.recurrence_next_campaign_id IS NOT NULL
         OR NEW.recurrence_closed_at IS NOT NULL
         OR NEW.recurrence_closed_reason IS NOT NULL THEN
        RAISE EXCEPTION 'talkx_recurrence_series_managed' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.recurrence_series_id IS DISTINCT FROM OLD.recurrence_series_id
       OR NEW.recurrence_next_campaign_id IS DISTINCT FROM OLD.recurrence_next_campaign_id
       OR NEW.recurrence_closed_at IS DISTINCT FROM OLD.recurrence_closed_at
       OR NEW.recurrence_closed_reason IS DISTINCT FROM OLD.recurrence_closed_reason THEN
      RAISE EXCEPTION 'talkx_recurrence_series_managed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_talkx_campaign_recurrence_series() FROM PUBLIC;

DROP TRIGGER IF EXISTS guard_talkx_campaign_recurrence_series ON public.talkx_campaigns;
CREATE TRIGGER guard_talkx_campaign_recurrence_series
  BEFORE INSERT OR UPDATE ON public.talkx_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.guard_talkx_campaign_recurrence_series();

-- 3. RPC: cria a proxima ocorrencia -------------------------------------------------
-- Retorna jsonb {scheduled, reason, campaign_id, recipients}. So service_role.
CREATE OR REPLACE FUNCTION public.schedule_next_talkx_recurrence(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_parent public.talkx_campaigns%ROWTYPE;
  v_series uuid;
  v_tz text;
  v_base timestamptz;
  v_local timestamp;
  v_date date;
  v_time time;
  v_floor date;
  v_candidate timestamptz := NULL;
  v_now timestamptz := statement_timestamp();
  v_owner_user uuid;
  v_new_id uuid;
  v_count integer := 0;
  v_segment record;
  v_rules jsonb;
  v_contact_ids uuid[];
  v_has_segment_rows boolean;
  v_i integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_recurrence_request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_parent
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_parent.recurrence_frequency IS NULL THEN
    RETURN jsonb_build_object('scheduled', false, 'reason', 'not_recurring');
  END IF;
  IF v_parent.recurrence_next_campaign_id IS NOT NULL THEN
    RETURN jsonb_build_object('scheduled', false, 'reason', 'already_scheduled',
                              'campaign_id', v_parent.recurrence_next_campaign_id);
  END IF;
  IF v_parent.recurrence_closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('scheduled', false, 'reason', 'closed');
  END IF;
  -- Pausada, cancelada, rascunho, agendada ou em envio: NAO reagenda.
  IF v_parent.status <> 'completed' THEN
    RETURN jsonb_build_object('scheduled', false, 'reason', 'not_completed');
  END IF;

  v_series := COALESCE(v_parent.recurrence_series_id, v_parent.id);
  v_tz := COALESCE(NULLIF(v_parent.schedule_timezone, ''), 'America/Sao_Paulo');

  -- Proxima data: parede local do horario previsto da ocorrencia (sem deriva por
  -- duracao do envio), no primeiro dia valido estritamente futuro.
  v_base := COALESCE(v_parent.scheduled_at, v_parent.completed_at, v_now);
  v_local := v_base AT TIME ZONE v_tz;
  v_date := v_local::date;
  v_time := v_local::time;
  v_floor := (v_now AT TIME ZONE v_tz)::date - 1;
  IF v_date < v_floor THEN
    v_date := v_floor;
  END IF;

  FOR v_i IN 1..8 LOOP
    v_date := v_date + 1;
    IF (v_parent.recurrence_frequency = 'daily'
        OR extract(dow FROM v_date)::smallint = ANY (v_parent.recurrence_weekdays))
       AND ((v_date + v_time) AT TIME ZONE v_tz) > v_now THEN
      v_candidate := (v_date + v_time) AT TIME ZONE v_tz;
      EXIT;
    END IF;
  END LOOP;

  IF v_candidate IS NULL
     OR (v_parent.recurrence_end_at IS NOT NULL AND v_candidate > v_parent.recurrence_end_at) THEN
    UPDATE public.talkx_campaigns
       SET recurrence_closed_at = v_now, recurrence_closed_reason = 'series_ended'
     WHERE id = v_parent.id;
    RETURN jsonb_build_object('scheduled', false, 'reason', 'series_ended');
  END IF;

  -- A audiencia usa a visibilidade do dono da campanha: talkx_audience_query le
  -- auth.uid(), entao a claim e fixada (so nesta transacao) no usuario do dono.
  SELECT profile.user_id INTO v_owner_user
    FROM public.profiles AS profile
   WHERE profile.id = COALESCE(v_parent.created_by, v_parent.responsible_id)
     AND profile.is_active = true;
  IF v_owner_user IS NULL THEN
    UPDATE public.talkx_campaigns
       SET recurrence_closed_at = v_now, recurrence_closed_reason = 'owner_inactive'
     WHERE id = v_parent.id;
    RETURN jsonb_build_object('scheduled', false, 'reason', 'owner_inactive');
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, true);

  -- (refazer 3, Ponto 4) Sem segunda guarda aqui: o bloco acima
  -- (IF v_candidate IS NULL OR ... > recurrence_end_at) ja encerra a serie
  -- antes do INSERT, que nunca e alcancado com v_candidate NULL.

  v_new_id := gen_random_uuid();

  -- Sucessora (consentimento e base legal herdados: a serie foi aprovada uma vez).
  INSERT INTO public.talkx_campaigns (
    id, name, message_template, variables_config, description, objective, audience_source,
    audience_filters, segment_id, template_id, template_version_id, whatsapp_connection_id,
    media_url, media_type, schedule_timezone, send_window_start, send_window_end,
    business_hours_only, speed_profile, typing_delay_min, typing_delay_max,
    send_interval_min, send_interval_max, respect_suppression, confirm_consent,
    consent_confirmed_by, consent_confirmed_at, legal_basis, owner, responsible_id,
    created_by, status, scheduled_at, total_recipients,
    recurrence_frequency, recurrence_weekdays, recurrence_end_at, recurrence_series_id
  ) VALUES (
    v_new_id, v_parent.name, v_parent.message_template, v_parent.variables_config,
    v_parent.description, v_parent.objective, v_parent.audience_source,
    v_parent.audience_filters, v_parent.segment_id, v_parent.template_id,
    v_parent.template_version_id, v_parent.whatsapp_connection_id,
    v_parent.media_url, v_parent.media_type, v_parent.schedule_timezone,
    v_parent.send_window_start, v_parent.send_window_end,
    v_parent.business_hours_only, v_parent.speed_profile, v_parent.typing_delay_min,
    v_parent.typing_delay_max, v_parent.send_interval_min, v_parent.send_interval_max,
    v_parent.respect_suppression, v_parent.confirm_consent,
    v_parent.consent_confirmed_by, v_parent.consent_confirmed_at, v_parent.legal_basis,
    v_parent.owner, v_parent.responsible_id,
    v_parent.created_by, 'scheduled', v_candidate, 0,
    v_parent.recurrence_frequency, v_parent.recurrence_weekdays,
    v_parent.recurrence_end_at, v_series
  );

  PERFORM set_config('app.talkx_recipient_snapshot_write', 'on', true);

  -- Mesmos segmentos, na mesma ordem (o primeiro que contem o contato "ganha").
  SELECT EXISTS (SELECT 1 FROM public.talkx_campaign_segments cs
                  WHERE cs.campaign_id = v_parent.id)
    INTO v_has_segment_rows;

  IF v_has_segment_rows THEN
    INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position)
    SELECT v_new_id, cs.segment_id, cs.position
      FROM public.talkx_campaign_segments cs
     WHERE cs.campaign_id = v_parent.id;
  END IF;

  FOR v_segment IN
    SELECT src.segment_id, src.position
      FROM (
        SELECT cs.segment_id, cs.position::integer AS position
          FROM public.talkx_campaign_segments cs
         WHERE cs.campaign_id = v_parent.id
        UNION ALL
        SELECT v_parent.segment_id, 1
         WHERE NOT v_has_segment_rows
           AND v_parent.audience_source = 'segment'
           AND v_parent.segment_id IS NOT NULL
        UNION ALL
        SELECT NULL::uuid, 1
         WHERE NOT v_has_segment_rows
           AND NOT (v_parent.audience_source = 'segment' AND v_parent.segment_id IS NOT NULL)
      ) AS src
     ORDER BY src.position
  LOOP
    v_contact_ids := NULL;
    IF v_segment.segment_id IS NOT NULL THEN
      SELECT COALESCE(segment.rules, '{"groups":[]}'::jsonb) INTO v_rules
        FROM public.talkx_segments AS segment
       WHERE segment.id = v_segment.segment_id;
      IF v_rules IS NULL OR jsonb_typeof(v_rules) <> 'object' THEN
        v_rules := '{"groups":[]}'::jsonb;
      END IF;
    ELSE
      v_rules := COALESCE(v_parent.audience_filters, '{}'::jsonb);
      IF jsonb_typeof(v_rules) <> 'object' THEN
        v_rules := '{}'::jsonb;
      END IF;
      IF jsonb_typeof(v_parent.audience_filters -> 'contact_ids') = 'array' THEN
        SELECT COALESCE(array_agg(requested.value::uuid), ARRAY[]::uuid[])
          INTO v_contact_ids
          FROM jsonb_array_elements_text(v_parent.audience_filters -> 'contact_ids') AS requested(value);
      END IF;
    END IF;

    INSERT INTO public.talkx_recipients (campaign_id, contact_id, segment_id)
    SELECT v_new_id, q.id, v_segment.segment_id
      FROM public.talkx_audience_query(v_rules, v_contact_ids, COALESCE(v_parent.respect_suppression, true)) AS q
     WHERE NOT q.legacy_or_deleted
       AND NOT q.invalid_phone
       AND NOT q.is_suppressed
       -- Anti-reenvio: ja recebeu (ou pode ter recebido) em QUALQUER ocorrencia da serie.
       AND NOT EXISTS (
         SELECT 1
           FROM public.talkx_recipients prior
           JOIN public.talkx_campaigns prior_campaign ON prior_campaign.id = prior.campaign_id
          WHERE prior.contact_id = q.id
            AND prior.campaign_id <> v_new_id
            AND (prior_campaign.id = v_series OR prior_campaign.recurrence_series_id = v_series)
            AND prior.status IN ('sending', 'sent', 'delivered', 'outcome_unknown')
       )
    ON CONFLICT (campaign_id, contact_id) DO NOTHING;
  END LOOP;

  SELECT count(*)::integer INTO v_count
    FROM public.talkx_recipients WHERE campaign_id = v_new_id;

  IF v_count = 0 THEN
    -- Todo mundo da audiencia ja recebeu: sem sucessora, serie encerrada.
    DELETE FROM public.talkx_campaigns WHERE id = v_new_id;
    UPDATE public.talkx_campaigns
       SET recurrence_closed_at = v_now, recurrence_closed_reason = 'audience_exhausted'
     WHERE id = v_parent.id;
    RETURN jsonb_build_object('scheduled', false, 'reason', 'audience_exhausted');
  END IF;

  UPDATE public.talkx_campaigns
     SET total_recipients = v_count, audience_snapshot_at = v_now
   WHERE id = v_new_id;
  UPDATE public.talkx_campaigns
     SET recurrence_next_campaign_id = v_new_id
   WHERE id = v_parent.id;

  RETURN jsonb_build_object('scheduled', true, 'campaign_id', v_new_id,
                            'scheduled_at', v_candidate, 'recipients', v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_next_talkx_recurrence(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_next_talkx_recurrence(uuid) TO service_role;

COMMENT ON FUNCTION public.schedule_next_talkx_recurrence(uuid) IS
  'Talk X: a partir de uma ocorrencia completed, clona a campanha como scheduled na proxima data da serie (daily/weekly), reavalia os mesmos segmentos e exclui quem ja recebeu em qualquer ocorrencia anterior. Pausada/cancelada nao reagenda. Somente service_role.';
