-- multiplix_drain_enum_cast
-- versao 20261007010129 (hermes-db-migrar --nova) -- R2-DB-007 / item 78 do BACKLOG_VERIFICADO.
-- Classe: CONTRATO (create or replace function). Uma migration, um defeito.
--
-- Rollback: bloco '-- rollback:' ao fim do arquivo com o CREATE OR REPLACE dos DOIS corpos
--   anteriores (o CASE SEM cast). Rodar o bloco desfaz esta migration e devolve as funcoes
--   ao estado pre-fix; ATENCAO: reintroduz o 42804 nas duas rotinas de conclusao.
--
-- ACHADO: a 20261001201230 (f30) converteu public.multiplix_dispatches.status de text para
-- o enum public.multiplix_dispatch_status. As DUAS rotinas que fecham um disparo DRENADO
-- continuaram montando o status com um CASE de literais:
--
--   SET status = CASE
--         WHEN dispatch.failed_count + dispatch.outcome_unknown_count > 0
--           THEN 'completed_with_failures'
--         ELSE 'completed'
--       END,
--
-- Pelo algoritmo de resolucao do CASE, os literais nascem 'unknown' e o resultado vira
-- text. Text NAO tem cast de atribuicao para enum (a conversao string -> tipo do usuario e
-- explicita), entao a chamada estoura:
--   42804: column "status" is of type multiplix_dispatch_status but expression is of type text
-- e o disparo NUNCA conclui (fica preso em 'sending' para sempre). A 20261002521230 (f59)
-- corrigiu o mesmo erro em transition_multiplix_dispatch, mas nao tocou nestas duas.
--
-- Medido no harness scripts/db-audit/multiplix-drain-enum-cast.test.sh (PostgreSQL 17
-- descartavel, migrations reais, enum real): sem esta migration o teste FALHA com o erro
-- identico; com ela, as duas rotinas fecham o disparo nos dois ramos.
--
-- Correcao minima: o MESMO cast explicito do f59, aplicado ao resultado do CASE nas duas
-- rotinas. Nada mais muda: contrato service_role, early-returns de guarda, completed_at,
-- updated_at e o RETURN FOUND ficam intactos (diff linha a linha contra a definicao vigente).

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

-- ---------------------------------------------------------------------------
-- Rollback executavel (mesma ordem do arquivo). Rode o bloco abaixo (sem o
-- prefixo '-- rollback: ') para desfazer esta migration: devolve os DOIS
-- corpos anteriores, com o CASE SEM cast.
-- ---------------------------------------------------------------------------
-- rollback: CREATE OR REPLACE FUNCTION public.complete_multiplix_dispatch_if_drained(p_dispatch_id uuid)
-- rollback:  RETURNS boolean
-- rollback:  LANGUAGE plpgsql
-- rollback:  SECURITY DEFINER
-- rollback:  SET search_path TO 'public', 'pg_temp'
-- rollback: AS $function$
-- rollback: DECLARE
-- rollback:   v_status text;
-- rollback: BEGIN
-- rollback:   IF COALESCE(auth.role(), '') <> 'service_role' THEN
-- rollback:     RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
-- rollback:   END IF;
-- rollback:   IF p_dispatch_id IS NULL THEN
-- rollback:     RAISE EXCEPTION 'invalid_multiplix_dispatch_id' USING ERRCODE = '22023';
-- rollback:   END IF;
-- rollback:   SELECT dispatch.status
-- rollback:     INTO v_status
-- rollback:     FROM public.multiplix_dispatches AS dispatch
-- rollback:    WHERE dispatch.id = p_dispatch_id
-- rollback:    FOR UPDATE;
-- rollback:   IF NOT FOUND THEN
-- rollback:     RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002';
-- rollback:   END IF;
-- rollback:   IF v_status <> 'sending' THEN
-- rollback:     RETURN false;
-- rollback:   END IF;
-- rollback:   IF EXISTS (
-- rollback:     SELECT 1
-- rollback:       FROM public.multiplix_recipients AS recipient
-- rollback:      WHERE recipient.dispatch_id = p_dispatch_id
-- rollback:        AND recipient.status IN ('pending', 'sending')
-- rollback:   ) THEN
-- rollback:     RETURN false;
-- rollback:   END IF;
-- rollback:   UPDATE public.multiplix_dispatches AS dispatch
-- rollback:      SET status = CASE
-- rollback:            WHEN dispatch.failed_count + dispatch.outcome_unknown_count > 0 THEN 'completed_with_failures'
-- rollback:            ELSE 'completed'
-- rollback:          END,
-- rollback:          completed_at = statement_timestamp(),
-- rollback:          updated_at = statement_timestamp()
-- rollback:    WHERE dispatch.id = p_dispatch_id
-- rollback:      AND dispatch.status = 'sending';
-- rollback:   RETURN FOUND;
-- rollback: END;
-- rollback: $function$;
-- rollback:
-- rollback: CREATE OR REPLACE FUNCTION public.complete_multiplix_dispatch_if_items_drained(p_dispatch_id uuid)
-- rollback: RETURNS boolean
-- rollback: LANGUAGE plpgsql
-- rollback: SECURITY DEFINER
-- rollback: SET search_path TO 'public', 'pg_temp'
-- rollback: AS $function$
-- rollback: DECLARE
-- rollback:   v_status text;
-- rollback: BEGIN
-- rollback:   IF COALESCE(auth.role(), '') <> 'service_role' THEN
-- rollback:     RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
-- rollback:   END IF;
-- rollback:   IF p_dispatch_id IS NULL THEN
-- rollback:     RAISE EXCEPTION 'invalid_multiplix_dispatch_id' USING ERRCODE = '22023';
-- rollback:   END IF;
-- rollback:   SELECT dispatch.status
-- rollback:     INTO v_status
-- rollback:     FROM public.multiplix_dispatches AS dispatch
-- rollback:    WHERE dispatch.id = p_dispatch_id
-- rollback:    FOR UPDATE;
-- rollback:   IF NOT FOUND THEN
-- rollback:     RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002';
-- rollback:   END IF;
-- rollback:   IF v_status <> 'sending' THEN
-- rollback:     RETURN false;
-- rollback:   END IF;
-- rollback:   IF EXISTS (
-- rollback:     SELECT 1
-- rollback:       FROM public.multiplix_delivery_items AS item
-- rollback:      WHERE item.dispatch_id = p_dispatch_id
-- rollback:        AND item.status IN ('pending', 'sending', 'failed_transient')
-- rollback:   ) THEN
-- rollback:     RETURN false;
-- rollback:   END IF;
-- rollback:   UPDATE public.multiplix_dispatches AS dispatch
-- rollback:      SET status = CASE
-- rollback:            WHEN dispatch.failed_count + dispatch.outcome_unknown_count > 0 THEN 'completed_with_failures'
-- rollback:            ELSE 'completed'
-- rollback:          END,
-- rollback:          completed_at = statement_timestamp(),
-- rollback:          updated_at = statement_timestamp()
-- rollback:    WHERE dispatch.id = p_dispatch_id
-- rollback:      AND dispatch.status = 'sending';
-- rollback:   RETURN FOUND;
-- rollback: END;
-- rollback: $function$;
