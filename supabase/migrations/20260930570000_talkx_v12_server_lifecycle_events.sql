-- talkx_v12_server_lifecycle_events
-- versão 20260930570000 reservada para hermes-talkx-fase1-v12-v21-2610011215c53b em 2026-10-01T12:19:30-03:00 (hermes-db-migrar --nova)
-- rollback: 1) recrie a transition_talkx_campaign sem o INSERT de evento (corpo da 20260916210000, 3 args); 2) recrie complete_talkx_campaign_if_drained sem o INSERT de evento (corpo da 20260911170000).
--
-- V12 do PLANO_TALKX_V3_100_ETAPAS_2026-09-29.
-- Hoje: started/paused/resumed/cancelled/completed só são gravados pelo CLIENTE
-- (useTalkXEvents.logEvent), então a timeline depende do front e qualquer
-- transição disparada pelo worker (scheduler/auto-pausa) não gera trilha.
-- Fazer: o SERVIDOR grava o evento dentro da própria transição, atômico com o
-- UPDATE de status, com actor_id (perfil do JWT, ou null quando o ator é o
-- worker) e message (motivo da pausa). O cliente para de inserir o evento
-- duplicado (TalkXLiveMonitor.tsx / useCampaignEditor.ts).

-- 1) transition_talkx_campaign grava started/resumed/paused/cancelled ----------
--    Substitui a assinatura de 3 args (uuid,text,text) pela de 4 (uuid,text,text,uuid).
--    Sem o DROP, o CREATE OR REPLACE de 4 args coexistiria com o de 3 e uma chamada
--    de 2 args voltaria a ser ambígua (PGRST203 — o mesmo defeito que a V02 corrigiu).
DROP FUNCTION IF EXISTS public.transition_talkx_campaign(uuid, text, text);

CREATE OR REPLACE FUNCTION public.transition_talkx_campaign(
  p_campaign_id uuid,
  p_action      text,
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
        -- V13: retomada idempotente — já enviando, a transição é no-op (não 55000).
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
      v_event_type := CASE WHEN v_campaign.status = 'paused' THEN 'resumed' ELSE 'started' END;
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
  END CASE;
  UPDATE public.talkx_campaigns AS campaign
  SET status       = v_next_status,
      pause_reason = CASE WHEN p_action = 'pause' THEN p_pause_reason ELSE NULL END,
      started_at   = CASE WHEN p_action = 'start'
        THEN COALESCE(campaign.started_at, statement_timestamp())
        ELSE campaign.started_at END,
      paused_at    = CASE WHEN p_action = 'pause' THEN statement_timestamp() ELSE campaign.paused_at END,
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

-- 2) complete_talkx_campaign_if_drained grava completed ------------------------
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
    INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
    VALUES (p_campaign_id, 'completed', NULL, NULL);
  END IF;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_talkx_campaign_if_drained(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_talkx_campaign_if_drained(uuid)
  TO service_role;
