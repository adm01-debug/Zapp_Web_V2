-- mx03_items_drain_enum_cast
-- Classe: CONTRATO (create or replace function) — mesma familia do F59
-- (20261002521230_f59_transition_dispatch_enum_cast.sql).
--
-- Rollback: recria o corpo ANTERIOR (sem o cast), byte a byte igual ao de
-- Rollback: 20261001231230_f32b_multiplix_item_queue_rpcs.sql. ATENCAO: reintroduz o 42804 abaixo.
--   CREATE OR REPLACE FUNCTION public.complete_multiplix_dispatch_if_items_drained(p_dispatch_id uuid)
--   RETURNS boolean
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path TO 'public', 'pg_temp'
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
--         FROM public.multiplix_delivery_items AS item
--        WHERE item.dispatch_id = p_dispatch_id
--          AND item.status IN ('pending', 'sending', 'failed_transient')
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
--     WHERE dispatch.id = p_dispatch_id
--       AND dispatch.status = 'sending';
--
--     RETURN FOUND;
--   END;
--   $function$;
--
--   REVOKE ALL ON FUNCTION public.complete_multiplix_dispatch_if_items_drained(uuid) FROM PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.complete_multiplix_dispatch_if_items_drained(uuid) TO service_role;
--
-- ACHADO (nao previsto no plano; encontrado ao ligar o worker no dreno por item):
--
-- A 20261001201230_f30 converteu multiplix_dispatches.status de text para o enum
-- public.multiplix_dispatch_status. A 20261001231230_f32b criou
-- complete_multiplix_dispatch_if_items_drained escrevendo
--   SET status = CASE WHEN ... > 0 THEN 'completed_with_failures' ELSE 'completed' END,
-- e um CASE de literais resolve para text — o Postgres NAO converte text -> enum numa
-- atribuicao de coluna (so um literal desconhecido converge). Toda chamada que chega ao
-- UPDATE estoura:
--   42804: column "status" is of type multiplix_dispatch_status but expression is of type text
--
-- A funcao nasceu sem NENHUM chamador (era o defeito MX03: o worker chamava o dreno do modelo
-- antigo, complete_multiplix_dispatch_if_drained), entao o erro nunca apareceu em producao.
-- Ao corrigir o worker para chamar o dreno POR ITEM, esta funcao passa a ser o caminho de
-- conclusao do disparo — sem este cast o worker devolveria 500 no fim de TODA passada
-- (`multiplix_dispatch_completion_failed`).
--
-- Correcao minima: UM cast explicito no unico ponto que a f30 quebrou (a atribuicao de status).
-- O resto do corpo fica intacto: contrato service_role, busca do disparo FOR UPDATE,
-- recusa com item nao-terminal (pending/sending/failed_transient) e o par
-- completed / completed_with_failures. Grants mantidos (service_role apenas; nunca anon/PUBLIC).

CREATE OR REPLACE FUNCTION public.complete_multiplix_dispatch_if_items_drained(p_dispatch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status text;
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

  -- `failed_transient` e o estado de retry da fila por item (§3 do cabecalho da f32b).
  IF EXISTS (
    SELECT 1
      FROM public.multiplix_delivery_items AS item
     WHERE item.dispatch_id = p_dispatch_id
       AND item.status IN ('pending', 'sending', 'failed_transient')
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.multiplix_dispatches AS dispatch
     SET status = (CASE
           WHEN dispatch.failed_count + dispatch.outcome_unknown_count > 0 THEN 'completed_with_failures'
           ELSE 'completed'
         END)::public.multiplix_dispatch_status,
         completed_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE dispatch.id = p_dispatch_id
     AND dispatch.status = 'sending';

  RETURN FOUND;
END;
$function$;

-- Idempotente e fechado: SO o service_role (a edge do worker) executa o dreno.
REVOKE ALL ON FUNCTION public.complete_multiplix_dispatch_if_items_drained(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_multiplix_dispatch_if_items_drained(uuid) TO service_role;
