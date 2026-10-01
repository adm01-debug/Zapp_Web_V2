-- talkx_v19_retry_recipient
-- Retry manual de um destinatário em estado terminal (failed/outcome_unknown).
-- O POST não é refeito cego: a edge revalida a supressão ANTES de chamar, e este
-- RPC só reabre o destinatário se attempt_count < 3. outcome_unknown continua
-- exigindo decisão humana (documentado em docs/talkx/OPERACAO.md).
-- rollback: DROP FUNCTION IF EXISTS public.retry_talkx_recipient(uuid);

CREATE OR REPLACE FUNCTION public.retry_talkx_recipient(p_recipient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt integer;
  v_status  text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT status, attempt_count
    INTO v_status, v_attempt
    FROM public.talkx_recipients
   WHERE id = p_recipient_id
   FOR UPDATE;

  IF NOT FOUND OR v_status NOT IN ('failed', 'outcome_unknown') THEN
    RETURN false;
  END IF;
  IF v_attempt >= 3 THEN
    RETURN false;
  END IF;

  UPDATE public.talkx_recipients
     SET status                    = 'pending',
         attempt_count             = attempt_count + 1,
         retry_after               = NULL,
         error_message             = NULL,
         delivery_claim_token      = NULL,
         delivery_claimed_at       = NULL,
         delivery_claim_expires_at = NULL,
         delivery_claimed_by       = NULL,
         delivery_last_claim_token = NULL,
         updated_at                = statement_timestamp()
   WHERE id = p_recipient_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_talkx_recipient(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retry_talkx_recipient(uuid) TO service_role;
