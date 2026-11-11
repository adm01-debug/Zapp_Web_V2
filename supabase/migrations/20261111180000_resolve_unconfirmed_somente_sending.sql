-- resolve_unconfirmed_somente_sending
-- Rollback: restaura resolve_unconfirmed_message com o corpo de 20261111160000 (aceita qualquer status fora de sent/delivered/read).
-- Rollback (SQL executável):
--   create or replace function public.resolve_unconfirmed_message( p_message_id uuid, p_outcome text ) returns uuid language plpgsql security definer set search_path = public, pg_temp as $function$ declare v_result uuid; v_new_status text; begin if coalesce(auth.role(), '') <> 'authenticated' then raise exception 'authenticated_required' using errcode = '42501'; end if; if p_outcome not in ('sent', 'not_delivered') then raise exception 'invalid_resolve_outcome' using errcode = '22023'; end if; if not public.is_admin_or_supervisor(auth.uid()) then raise exception 'admin_or_supervisor_required' using errcode = '42501'; end if; v_new_status := case p_outcome when 'sent' then 'sent' else 'failed' end; update public.messages set status = v_new_status, status_updated_at = statement_timestamp(), manually_resolved_at = statement_timestamp(), updated_at = statement_timestamp() where id = p_message_id and delivery_post_started_at is not null and manually_resolved_at is null and status not in ('sent', 'delivered', 'read') and (delivery_claim_expires_at is null or delivery_claim_expires_at <= statement_timestamp()) returning id into v_result; if not found then raise exception 'message_not_resolvable' using errcode = 'P0002'; end if; return v_result; end; $function$;
--   revoke all on function public.resolve_unconfirmed_message(uuid, text) from public, anon;
--   grant execute on function public.resolve_unconfirmed_message(uuid, text) to authenticated;
--
-- C110 / PD-79: a 20261111160000 deixava o admin/supervisor "resolver" qualquer
-- linha com carimbo de POST fora de sent/delivered/read. Isso incluía 'failed'
-- gravado por fail_outbound_message depois de uma recusa DEFINITIVA (4xx) do
-- provedor: a mensagem recusada podia ser marcada 'sent' à mão, sem recibo.
-- Ambígua é só a linha que ficou em 'sending' com o POST carimbado e o lease
-- vencido. Esta migration restringe a RPC a status = 'sending'.
--
-- ORDEM: depende de 20261111160000 (colunas delivery_post_started_at e
-- manually_resolved_at). Sem elas, aborta antes de alterar qualquer coisa.
-- Nada mais muda: CREATE OR REPLACE da mesma assinatura (ACL preservada e
-- reafirmada), sem DML.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

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
$precond$;

CREATE OR REPLACE FUNCTION public.resolve_unconfirmed_message(
  p_message_id uuid,
  p_outcome    text  -- 'sent' | 'not_delivered'
) RETURNS uuid
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

  IF p_outcome NOT IN ('sent', 'not_delivered') THEN
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
$function$;

COMMENT ON FUNCTION public.resolve_unconfirmed_message(uuid, text) IS
  'C110: correção manual (admin/supervisor) de mensagem com entrega ambígua: POST carimbado, status=sending e lease vencido. Recusa failed (recusa definitiva do provedor).';

REVOKE ALL ON FUNCTION public.resolve_unconfirmed_message(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_unconfirmed_message(uuid, text)
  TO authenticated;

COMMIT;
