-- 20261006064259_multiplix_conclusao_fila_itens
-- Rollback: recria public.complete_multiplix_dispatch_if_drained(uuid) com o corpo ANTERIOR
-- (definicao viva, de supabase/migrations/20260929600000_multiplix_send_engine_fixes.sql:90-141)
-- e repoe o ACL anterior. SQL do rollback:
--   CREATE OR REPLACE FUNCTION public.complete_multiplix_dispatch_if_drained(p_dispatch_id uuid)
--    RETURNS boolean
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--    SET search_path TO 'public', 'pg_temp'
--   AS $function$
--   DECLARE
--     v_status text;
--   BEGIN
--     IF COALESCE(auth.role(), '') <> 'service_role' THEN
--       RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
--     END IF;
--     IF p_dispatch_id IS NULL THEN
--       RAISE EXCEPTION 'invalid_multiplix_dispatch_id' USING ERRCODE = '22023';
--     END IF;
--
--     SELECT dispatch.status
--       INTO v_status
--       FROM public.multiplix_dispatches AS dispatch
--      WHERE dispatch.id = p_dispatch_id
--      FOR UPDATE;
--
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002';
--     END IF;
--
--     IF v_status <> 'sending' THEN
--       RETURN false;
--     END IF;
--
--     IF EXISTS (
--       SELECT 1
--         FROM public.multiplix_recipients AS recipient
--        WHERE recipient.dispatch_id = p_dispatch_id
--          AND recipient.status IN ('pending', 'sending')
--     ) THEN
--       RETURN false;
--     END IF;
--
--     UPDATE public.multiplix_dispatches AS dispatch
--        SET status = CASE
--              WHEN dispatch.failed_count + dispatch.outcome_unknown_count > 0 THEN 'completed_with_failures'
--              ELSE 'completed'
--            END,
--            completed_at = statement_timestamp(),
--            updated_at = statement_timestamp()
--      WHERE dispatch.id = p_dispatch_id
--        AND dispatch.status = 'sending';
--
--     RETURN FOUND;
--   END;
--   $function$;
--
--   REVOKE ALL ON FUNCTION public.complete_multiplix_dispatch_if_drained(uuid) FROM PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.complete_multiplix_dispatch_if_drained(uuid) TO service_role;
--
-- Item 47 do BACKLOG_VERIFICADO (MX03, P1 funcional): "Conclusao usa a fila antiga de
-- recipients apos enviar itens".
--
-- HOJE (antes desta migration): o worker `multiplix-send` chama
-- `complete_multiplix_dispatch_if_drained` no fim da passada; a definicao viva dela decide
-- drenagem por `multiplix_recipients.status IN ('pending','sending')`. A fila por item
-- (`multiplix_delivery_items`, F32a/F32b) e quem realmente governa o envio novo, e as RPCs
-- `record_multiplix_item_sent`/`complete_multiplix_item` NAO atualizam o status/sent_at do
-- recipient. Efeito: (a) com itens terminais e recipients ainda 'pending' o dispatch nunca
-- conclui (fica 'sending' para sempre, cron reinvocando a toa); (b) no sentido inverso,
-- recipients terminais com item ainda na fila fazem o dispatch concluir cedo.
--
-- FAZER: a conclusao passa a olhar a fila CERTA — se o dispatch tem itens, decide pelos
-- itens (nao-terminais: 'pending', 'sending', 'failed_transient'); se nao tem itens
-- (fluxo legado, dispatch anterior ao F32), mantem a decisao por `multiplix_recipients`.
-- Mesmo nome, mesma assinatura e mesmo ACL: o worker nao muda.
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION + ACL). Nenhum DROP, nenhuma coluna, nenhum
-- indice, nenhum grant de tabela: nada muda de forma no schema alem do corpo da funcao.

CREATE OR REPLACE FUNCTION public.complete_multiplix_dispatch_if_drained(p_dispatch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status    text;
  v_has_items boolean;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_dispatch_id IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_dispatch_id' USING ERRCODE = '22023';
  END IF;

  SELECT dispatch.status
    INTO v_status
    FROM public.multiplix_dispatches AS dispatch
   WHERE dispatch.id = p_dispatch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'sending' THEN
    RETURN false;
  END IF;

  -- Fila por item e a dona do envio quando existe: as RPCs de item nao escrevem em
  -- multiplix_recipients, entao decidir por recipients deixava o dispatch preso em 'sending'.
  SELECT EXISTS (
    SELECT 1
      FROM public.multiplix_delivery_items AS item
     WHERE item.dispatch_id = p_dispatch_id
  ) INTO v_has_items;

  IF v_has_items THEN
    IF EXISTS (
      SELECT 1
        FROM public.multiplix_delivery_items AS item
       WHERE item.dispatch_id = p_dispatch_id
         AND item.status IN ('pending', 'sending', 'failed_transient')
    ) THEN
      RETURN false;
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
        FROM public.multiplix_recipients AS recipient
       WHERE recipient.dispatch_id = p_dispatch_id
         AND recipient.status IN ('pending', 'sending')
    ) THEN
      RETURN false;
    END IF;
  END IF;

  UPDATE public.multiplix_dispatches AS dispatch
     SET status = CASE
           WHEN dispatch.failed_count + dispatch.outcome_unknown_count > 0 THEN 'completed_with_failures'
           ELSE 'completed'
         END,
         completed_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE dispatch.id = p_dispatch_id
     AND dispatch.status = 'sending';

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_multiplix_dispatch_if_drained(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_multiplix_dispatch_if_drained(uuid)
  TO service_role;
