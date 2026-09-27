-- Reconciliação: migration aplicada diretamente em produção via MCP (2026-09-26),
-- sem arquivo em git (drift detectado pelo db-live-guard). Conteúdo extraído do
-- ledger (version 20260926430000, ledger_statements_sha256=c4b77c2f...). Ver PR e
-- issue #887 (db-live-guard) para o histórico completo.

CREATE OR REPLACE FUNCTION public.record_multiplix_recipient_delivered(
  p_external_id text,
  p_connection_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_recipient_id uuid;
  v_dispatch_id uuid;
  v_external_id text := NULLIF(btrim(p_external_id), '');
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF v_external_id IS NULL OR length(v_external_id) > 512 OR p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_ack' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_external_id, 0));
  BEGIN
    SELECT recipient.id, recipient.dispatch_id
      INTO STRICT v_recipient_id, v_dispatch_id
      FROM public.multiplix_recipients AS recipient
      JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = recipient.dispatch_id
     WHERE recipient.external_id = v_external_id
       AND recipient.delivered_at IS NULL
       AND dispatch.whatsapp_connection_id = p_connection_id
     FOR UPDATE OF recipient;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RETURN false;
  END;

  UPDATE public.multiplix_recipients
     SET status = 'delivered',
         delivered_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE id = v_recipient_id;

  UPDATE public.multiplix_dispatches AS dispatch
     SET delivered_count = dispatch.delivered_count + 1,
         updated_at = statement_timestamp()
   WHERE dispatch.id = v_dispatch_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_multiplix_recipient_delivered(text, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_multiplix_recipient_delivered(text, uuid)
  TO service_role;
