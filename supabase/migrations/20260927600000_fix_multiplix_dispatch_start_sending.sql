-- 20260927600000_fix_multiplix_dispatch_start_sending
-- Corrige deadlock: pg_cron dispara transition_multiplix_dispatch(start)
-- a cada 2min em dispatches com status 'sending'. Versão anterior rejeitava
-- 'sending' com 55000, causando loop infinito de 409.
-- Fix: permite 'sending → start' somente quando updated_at > 3 min atrás
-- (worker estagnado). Se worker ativo (< 3 min), levanta 55001
-- 'multiplix_dispatch_already_running' — edge function trata como skip gracioso.

CREATE OR REPLACE FUNCTION public.transition_multiplix_dispatch(p_dispatch_id uuid, p_action text, p_pause_reason text DEFAULT NULL::text)
 RETURNS TABLE(dispatch_id uuid, previous_status text, current_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch public.multiplix_dispatches%ROWTYPE;
  v_next_status text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_dispatch_id IS NULL OR p_action NOT IN ('start', 'pause', 'cancel') THEN
    RAISE EXCEPTION 'invalid_multiplix_dispatch_transition' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.multiplix_dispatches AS dispatch
  WHERE dispatch.id = p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  CASE p_action
    WHEN 'start' THEN
      IF v_dispatch.status = 'sending' AND v_dispatch.updated_at > now() - interval '3 minutes' THEN
        RAISE EXCEPTION 'multiplix_dispatch_already_running' USING ERRCODE = '55001';
      END IF;
      IF v_dispatch.status NOT IN ('draft', 'scheduled', 'paused', 'sending') THEN
        RAISE EXCEPTION 'multiplix_dispatch_start_denied_from_%', v_dispatch.status USING ERRCODE = '55000';
      END IF;
      IF btrim(COALESCE(v_dispatch.message_template, '')) = '' THEN
        RAISE EXCEPTION 'multiplix_dispatch_message_required' USING ERRCODE = '22023';
      END IF;
      IF v_dispatch.total_recipients <= 0
         OR NOT EXISTS (
           SELECT 1 FROM public.multiplix_recipients AS recipient
           WHERE recipient.dispatch_id = p_dispatch_id
         ) THEN
        RAISE EXCEPTION 'multiplix_dispatch_recipients_required' USING ERRCODE = '22023';
      END IF;
      v_next_status := 'sending';
    WHEN 'pause' THEN
      IF v_dispatch.status <> 'sending' THEN
        RAISE EXCEPTION 'multiplix_dispatch_pause_denied_from_%', v_dispatch.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'paused';
    WHEN 'cancel' THEN
      IF v_dispatch.status NOT IN ('draft', 'scheduled', 'sending', 'paused') THEN
        RAISE EXCEPTION 'multiplix_dispatch_cancel_denied_from_%', v_dispatch.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'cancelled';
  END CASE;

  UPDATE public.multiplix_dispatches AS dispatch
  SET status       = v_next_status,
      pause_reason = CASE WHEN p_action = 'pause' THEN p_pause_reason ELSE NULL END,
      started_at   = CASE WHEN p_action = 'start'
        THEN COALESCE(dispatch.started_at, statement_timestamp())
        ELSE dispatch.started_at END,
      paused_at    = CASE WHEN p_action = 'pause' THEN statement_timestamp() ELSE dispatch.paused_at END,
      updated_at   = statement_timestamp()
  WHERE dispatch.id = p_dispatch_id;

  RETURN QUERY SELECT p_dispatch_id, v_dispatch.status, v_next_status;
END;
$function$;
