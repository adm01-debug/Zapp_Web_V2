-- multiplix_drain_enum_cast
-- Rollback: as DUAS drenagens voltam ao corpo ANTERIOR (o CASE de literais text sem cast) — SQL executavel logo abaixo.
-- Rollback (SQL executavel, na ordem):
--   CREATE OR REPLACE FUNCTION public.complete_multiplix_dispatch_if_drained(p_dispatch_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ DECLARE v_status text; BEGIN IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501'; END IF; IF p_dispatch_id IS NULL THEN RAISE EXCEPTION 'invalid_multiplix_dispatch_id' USING ERRCODE = '22023'; END IF; SELECT dispatch.status INTO v_status FROM public.multiplix_dispatches AS dispatch WHERE dispatch.id = p_dispatch_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002'; END IF; IF v_status <> 'sending' THEN RETURN false; END IF; IF EXISTS ( SELECT 1 FROM public.multiplix_recipients AS recipient WHERE recipient.dispatch_id = p_dispatch_id AND recipient.status IN ('pending', 'sending') ) THEN RETURN false; END IF; UPDATE public.multiplix_dispatches AS dispatch SET status = CASE WHEN dispatch.failed_count + dispatch.outcome_unknown_count > 0 THEN 'completed_with_failures' ELSE 'completed' END, completed_at = statement_timestamp(), updated_at = statement_timestamp() WHERE dispatch.id = p_dispatch_id AND dispatch.status = 'sending'; RETURN FOUND; END; $function$;
--   CREATE OR REPLACE FUNCTION public.complete_multiplix_dispatch_if_items_drained(p_dispatch_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ DECLARE v_status text; BEGIN IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501'; END IF; IF p_dispatch_id IS NULL THEN RAISE EXCEPTION 'invalid_multiplix_dispatch_id' USING ERRCODE = '22023'; END IF; SELECT dispatch.status INTO v_status FROM public.multiplix_dispatches AS dispatch WHERE dispatch.id = p_dispatch_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002'; END IF; IF v_status <> 'sending' THEN RETURN false; END IF; IF EXISTS ( SELECT 1 FROM public.multiplix_delivery_items AS item WHERE item.dispatch_id = p_dispatch_id AND item.status IN ('pending', 'sending', 'failed_transient') ) THEN RETURN false; END IF; UPDATE public.multiplix_dispatches AS dispatch SET status = CASE WHEN dispatch.failed_count + dispatch.outcome_unknown_count > 0 THEN 'completed_with_failures' ELSE 'completed' END, completed_at = statement_timestamp(), updated_at = statement_timestamp() WHERE dispatch.id = p_dispatch_id AND dispatch.status = 'sending'; RETURN FOUND; END; $function$;
--
-- versao 20261009011641 (hermes-db-migrar --nova) — F89/TL-048, correcao de banco.
-- Classe: CONTRATO (create or replace function). Nenhum GRANT/REVOKE/COMMENT/policy/trigger.
--
-- DEFEITO (medido em 08/10/2026, PostgreSQL 17 descartavel, harness
-- scripts/db-audit/multiplix-delivery-leases.test.sh): as DUAS RPCs de drenagem do
-- Multiplix montam o status novo num CASE de literais `text` e o ATRIBUEM a coluna ENUM
-- `multiplix_dispatches.status`:
--
--   SET status = CASE WHEN dispatch.failed_count + dispatch.outcome_unknown_count > 0
--                     THEN 'completed_with_failures' ELSE 'completed' END
--
-- O PostgreSQL resolve esse CASE para `text`; atribuir `text` a enum exige cast explicito
-- (so um literal desconhecido converge sozinho). Resultado:
--
--   ERROR: column "status" is of type multiplix_dispatch_status but expression is of type text  (42804)
--
-- e o erro estoura em TODA chamada que chega ao UPDATE — exatamente o passo em que a RPC
-- CONCLUI o disparo. A fila esvazia e o disparo fica 'sending' para sempre (o cron
-- reinvocando a drenagem). Atinge os DOIS caminhos: a fila por ITEM
-- (`complete_multiplix_dispatch_if_items_drained`, f32b §10) e a fila por DESTINATARIO
-- (`complete_multiplix_dispatch_if_drained`, a que o worker chama hoje —
-- supabase/functions/multiplix-send/index.ts). Mesma classe que o F59 ja consertou em
-- `transition_multiplix_dispatch` (`v_next_status::public.multiplix_dispatch_status`,
-- 20261002521230); aquele caso tinha teste, o dreno nao tinha.
--
-- CORRECAO: um cast explicito no CASE das duas funcoes, o MESMO padrao do F59. O corpo das
-- duas e copia byte a byte do vigente — muda so o `SET status` abaixo:
--
--   SET status = (CASE ... END)::public.multiplix_dispatch_status
--
-- Nada mais muda: `CREATE OR REPLACE` preserva a ACL (o REVOKE/GRANT das duas segue como
-- esta), a assinatura e a de antes, e nenhum COMMENT e reescrito.
-- Prova: bloco (8)/(9) do harness citado — fila inteira terminal conclui 'completed' com
-- sent_count=4; um item em outcome_unknown conclui 'completed_with_failures' (parcial nunca
-- aparece como concluido). Sem esta migration os dois casos falham com o 42804 acima.

-- ── drenagem por DESTINATARIO (a que o worker chama hoje) ───────────────────────
CREATE OR REPLACE FUNCTION public.complete_multiplix_dispatch_if_drained(p_dispatch_id uuid)
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

  IF EXISTS (
    SELECT 1
      FROM public.multiplix_recipients AS recipient
     WHERE recipient.dispatch_id = p_dispatch_id
       AND recipient.status IN ('pending', 'sending')
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

-- ── drenagem por ITEM (modelo v2) ────────────────────────────────────────────────
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

  -- `failed_transient` e o estado de retry da fila por item (§3 do cabecalho).
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
