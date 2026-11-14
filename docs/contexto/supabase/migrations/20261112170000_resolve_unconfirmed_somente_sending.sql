SET LOCAL lock_timeout = '5s'

SET LOCAL statement_timeout = '120s'

DO $precond$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns AS col
       WHERE col.table_schema = 'public' AND col.table_name = 'messages'
         AND col.column_name = 'delivery_post_started_at'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns AS col
       WHERE col.table_schema = 'public' AND col.table_name = 'messages'
         AND col.column_name = 'manually_resolved_at'
     ) THEN
    RAISE EXCEPTION 'resolve_unconfirmed_somente_sending_requires_20261111160000'
      USING ERRCODE = '55000',
            HINT = 'Aplique antes a migration 20261111160000_outbound_post_started.';
  END IF;
END
$precond$

CREATE OR REPLACE FUNCTION public.resolve_unconfirmed_message(
  p_message_id uuid,
  p_outcome    text  ) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_result    uuid;
  v_new_status text;
BEGIN
  -- SECURITY DEFINER — RLS não se aplica; verificação de papel e permissão explícita abaixo
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RAISE EXCEPTION 'authenticated_required' USING ERRCODE = '42501';
  END IF;

  -- NULL também é recusado: com NULL o NOT IN dá NULL (não dispara) e o CASE
  -- abaixo cairia no ELSE 'failed', gravando resolução sem desfecho escolhido.
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent', 'not_delivered') THEN
    RAISE EXCEPTION 'invalid_resolve_outcome' USING ERRCODE = '22023';
  END IF;

  -- Somente admin ou supervisor podem corrigir
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'admin_or_supervisor_required' USING ERRCODE = '42501';
  END IF;

  v_new_status := CASE p_outcome WHEN 'sent' THEN 'sent' ELSE 'failed' END;

  -- Só a linha AMBÍGUA: POST carimbado, ainda em 'sending' e com o lease vencido.
  -- 'failed' (recusa definitiva do provedor) não é resolvível.
  UPDATE public.messages
  SET
    status               = v_new_status,
    status_updated_at    = statement_timestamp(),
    manually_resolved_at = statement_timestamp(),
    updated_at           = statement_timestamp()
  WHERE id                        = p_message_id
    AND delivery_post_started_at IS NOT NULL
    AND manually_resolved_at     IS NULL
    AND status                    = 'sending'
    AND (delivery_claim_expires_at IS NULL OR delivery_claim_expires_at <= statement_timestamp())
  RETURNING id INTO v_result;

  IF NOT FOUND THEN
    -- Mensagem inexistente, já resolvida ou não elegível
    RAISE EXCEPTION 'message_not_resolvable' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$function$

COMMENT ON FUNCTION public.resolve_unconfirmed_message(uuid, text) IS
  'C110: correção manual (admin/supervisor) de mensagem com entrega ambígua: POST carimbado, status=sending e lease vencido. Recusa failed (recusa definitiva do provedor).'

REVOKE ALL ON FUNCTION public.resolve_unconfirmed_message(uuid, text)
  FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.resolve_unconfirmed_message(uuid, text)
  TO authenticated
