-- talkx_lifecycle_events_delta
-- versão 20261003172707 reservada para hermes-talkx-ciclo-vida-evento-ator-motivo-26100313302ea0 em 2026-10-03T13:47:19-03:00 (hermes-db-migrar --nova)
-- X024: delta de eventos de ciclo de vida com ator e motivo + fechar a fila ao cancelar
-- (Fase 3 · Camada banco · CAP-053, CAP-054, CAP-055, CAP-106)
-- rollback: 1) recrie transition_talkx_campaign com o corpo de 20261002431230 (sem resumed_auto,
--              paused_by/cancelled_by/cancelled_at e sem liberar leases no cancel);
--           2) recrie complete_talkx_campaign_if_drained com o corpo de 20260930650000 (completed sem resumo);
--           3) DROP TRIGGER/FUNCTION record_talkx_campaign_lifecycle_event;
--           4) recrie o CHECK talkx_campaign_events_type_check sem resumed_auto/scheduled_updated;
--           5) DROP COLUMN paused_by/cancelled_by/cancelled_at.
--
-- Delta da V12 (20260930650000, PARCIAL) + completude do aceite de ciclo de vida.
-- NOTA 1 (regressão V21): já foi corrigida por 20261002431230_talkx_regressoes_fix
-- (transition_talkx_campaign volta a gravar launched_by/launched_at no start); esta migration
-- PRESERVA esse CASE (não o remove) e só acrescenta o delta.
-- NOTA 2 (CHECK de event_type): resumed_auto e scheduled_updated JÁ são aceitos desde a V11
-- (20260929730000, 19 tipos) e o CHECK atual tem 27 (V11+X021). Esta migration NÃO toca o CHECK.

-- 1) colunas de ator/motivo da pausa e do cancelamento --------------------------
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS paused_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

COMMENT ON COLUMN public.talkx_campaigns.paused_by IS 'Perfil que pausou a campanha (X024).';
COMMENT ON COLUMN public.talkx_campaigns.cancelled_by IS 'Perfil que cancelou a campanha (X024).';
COMMENT ON COLUMN public.talkx_campaigns.cancelled_at IS 'Momento do cancelamento (X024).';

-- 2) transition_talkx_campaign: resumed_auto + atores/motivo + liberar leases -----
-- Assinatura única (4 args + 2 defaults) preservada — contrato do check-talkx-transition-contract.sql.
-- nomes-antigos-conferidos: transition_talkx_campaign — as assinaturas legadas de 2/3 args já foram
-- removidas em produção (20260929420000/V12); não há DROP aqui, apenas CREATE OR REPLACE da de 4 args.
CREATE OR REPLACE FUNCTION public.transition_talkx_campaign(
  p_campaign_id  uuid,
  p_action       text,
  p_pause_reason text DEFAULT NULL,
  p_actor_id     uuid DEFAULT NULL
)
RETURNS TABLE(campaign_id uuid, previous_status text, current_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_next_status text;
  v_event_type  text;
  v_event_msg   text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL OR p_action NOT IN ('start', 'pause', 'cancel') THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_transition' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_campaign
  FROM public.talkx_campaigns AS campaign
  WHERE campaign.id = p_campaign_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  CASE p_action
    WHEN 'start' THEN
      IF v_campaign.status = 'sending' THEN
        -- X010: retomada idempotente — já enviando, a transição é no-op e NÃO toca
        -- em started_at (o UPDATE abaixo nem chega a rodar).
        RETURN QUERY SELECT p_campaign_id, 'sending', 'sending';
        RETURN;
      END IF;
      IF v_campaign.status NOT IN ('draft', 'scheduled', 'paused') THEN
        RAISE EXCEPTION 'talkx_campaign_start_denied_from_%', v_campaign.status USING ERRCODE = '55000';
      END IF;
      IF btrim(COALESCE(v_campaign.message_template, '')) = '' THEN
        RAISE EXCEPTION 'talkx_campaign_message_required' USING ERRCODE = '22023';
      END IF;
      IF v_campaign.total_recipients <= 0
         OR NOT EXISTS (
           SELECT 1 FROM public.talkx_recipients AS recipient
           WHERE recipient.campaign_id = p_campaign_id
         ) THEN
        RAISE EXCEPTION 'talkx_campaign_recipients_required' USING ERRCODE = '22023';
      END IF;
      v_next_status := 'sending';
      -- X024: retomada distinta — com ator é 'resumed', sem ator (worker/cron) é 'resumed_auto'.
      v_event_type := CASE
        WHEN v_campaign.status = 'paused' THEN
          CASE WHEN p_actor_id IS NULL THEN 'resumed_auto' ELSE 'resumed' END
        ELSE 'started'
      END;
      v_event_msg := NULL;
    WHEN 'pause' THEN
      IF v_campaign.status <> 'sending' THEN
        RAISE EXCEPTION 'talkx_campaign_pause_denied_from_%', v_campaign.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'paused';
      v_event_type := 'paused';
      v_event_msg := p_pause_reason;
    WHEN 'cancel' THEN
      IF v_campaign.status NOT IN ('draft', 'scheduled', 'sending', 'paused') THEN
        RAISE EXCEPTION 'talkx_campaign_cancel_denied_from_%', v_campaign.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'cancelled';
      v_event_type := 'cancelled';
      v_event_msg := NULL;
      -- V14 + X024: fecha a fila — pendentes e em voo viram cancelled; leases são soltas
      -- sem dispatch (delivery_claim_* = NULL respeita o CHECK talkx_recipients_delivery_claim_state).
      UPDATE public.talkx_recipients AS recipient
      SET status = 'cancelled',
          delivery_claim_token = NULL,
          delivery_claimed_at = NULL,
          delivery_claim_expires_at = NULL,
          delivery_claimed_by = NULL,
          updated_at = statement_timestamp()
      WHERE recipient.campaign_id = p_campaign_id
        AND recipient.status IN ('pending', 'sending');
  END CASE;
  UPDATE public.talkx_campaigns AS campaign
  SET status       = v_next_status,
      pause_reason = CASE WHEN p_action = 'pause' THEN p_pause_reason ELSE NULL END,
      started_at   = CASE WHEN p_action = 'start'
        THEN COALESCE(campaign.started_at, statement_timestamp())
        ELSE campaign.started_at END,
      launched_by  = CASE WHEN p_action = 'start'
        THEN COALESCE(campaign.launched_by, p_actor_id)
        ELSE campaign.launched_by END,
      launched_at  = CASE WHEN p_action = 'start'
        THEN COALESCE(campaign.launched_at, statement_timestamp())
        ELSE campaign.launched_at END,
      paused_at    = CASE WHEN p_action = 'pause' THEN statement_timestamp() ELSE campaign.paused_at END,
      paused_by    = CASE
        WHEN p_action = 'pause' THEN p_actor_id
        WHEN p_action = 'start' THEN NULL
        ELSE campaign.paused_by END,
      cancelled_at = CASE WHEN p_action = 'cancel' THEN statement_timestamp() ELSE campaign.cancelled_at END,
      cancelled_by = CASE WHEN p_action = 'cancel' THEN p_actor_id ELSE campaign.cancelled_by END,
      -- X024: cancelar solta a trava do worker — nenhum worker continua a campanha.
      worker_id    = CASE WHEN p_action = 'cancel' THEN NULL ELSE campaign.worker_id END,
      worker_lease_expires_at = CASE WHEN p_action = 'cancel' THEN NULL ELSE campaign.worker_lease_expires_at END,
      updated_at   = statement_timestamp()
  WHERE campaign.id = p_campaign_id;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
  VALUES (p_campaign_id, v_event_type, v_event_msg, p_actor_id);

  RETURN QUERY SELECT p_campaign_id, v_campaign.status, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_talkx_campaign(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_talkx_campaign(uuid, text, text, uuid)
  TO service_role;

-- 4) complete_talkx_campaign_if_drained: completed com resumo -------------------
CREATE OR REPLACE FUNCTION public.complete_talkx_campaign_if_drained(
  p_campaign_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_status text;
  v_resumo text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_id' USING ERRCODE = '22023';
  END IF;

  SELECT campaign.status
    INTO v_status
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'sending' THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.talkx_recipients AS recipient
     WHERE recipient.campaign_id = p_campaign_id
       AND recipient.status IN ('pending', 'sending')
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.talkx_campaigns
     SET status = 'completed',
         completed_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE id = p_campaign_id
     AND status = 'sending';

  IF FOUND THEN
    -- X024: resumo no evento de conclusão (números finais).
    SELECT jsonb_build_object(
      'total', campaign.total_recipients,
      'sent', campaign.sent_count,
      'failed', campaign.failed_count,
      'delivered', campaign.delivered_count,
      'outcome_unknown', campaign.outcome_unknown_count,
      'cancelled', (
        SELECT count(*) FROM public.talkx_recipients recipient
         WHERE recipient.campaign_id = p_campaign_id
           AND recipient.status = 'cancelled'
      )
    )::text INTO v_resumo
    FROM public.talkx_campaigns campaign
    WHERE campaign.id = p_campaign_id;

    INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
    VALUES (p_campaign_id, 'completed', v_resumo, NULL);
  END IF;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_talkx_campaign_if_drained(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_talkx_campaign_if_drained(uuid)
  TO service_role;

-- 5) eventos created/updated/scheduled/scheduled_updated por trigger -------------
-- Um único trigger cobre o ciclo de vida do rascunho e da agenda SEM reescrever
-- save_talkx_campaign_draft (que evoluiu por muitas migrations — 20261002431230 é o
-- corpo vivo). 'created' sai do INSERT do rascunho; 'updated' do UPDATE sem mudança
-- de status; 'scheduled' da passagem draft→scheduled; 'scheduled_updated' da
-- reprogramação de um scheduled. Só dispara por caminho authenticated — as transições
-- de service_role (start/pause/cancel/complete/lease) não geram eventos de rascunho.
CREATE OR REPLACE FUNCTION public.record_talkx_campaign_lifecycle_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor uuid;
  v_event text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT profile.id INTO v_actor
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
    VALUES (NEW.id, 'created', NULL, v_actor);
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'scheduled' THEN
    v_event := 'scheduled';
  ELSIF OLD.status = 'scheduled' AND NEW.status = 'scheduled'
        AND (NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
             OR NEW.schedule_timezone IS DISTINCT FROM OLD.schedule_timezone) THEN
    v_event := 'scheduled_updated';
  ELSE
    v_event := 'updated';
  END IF;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
  VALUES (NEW.id, v_event, NULL, v_actor);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS record_talkx_campaign_lifecycle_event ON public.talkx_campaigns;
CREATE TRIGGER record_talkx_campaign_lifecycle_event
  AFTER INSERT OR UPDATE ON public.talkx_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.record_talkx_campaign_lifecycle_event();

-- fail-closed -------------------------------------------------------------------
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.transition_talkx_campaign(uuid,text,text,uuid)'),
      ('public.complete_talkx_campaign_if_drained(uuid)'),
      ('public.record_talkx_campaign_lifecycle_event()')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_lifecycle_rpcs_ausentes: %', v_missing;
  END IF;
END;
$$;
