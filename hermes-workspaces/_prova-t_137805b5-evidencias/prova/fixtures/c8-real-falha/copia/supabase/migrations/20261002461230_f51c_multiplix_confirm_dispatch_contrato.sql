-- f51c_multiplix_confirm_dispatch_contrato
-- versão 20261002461230 reservada para hermes-bloco-e-api-dominio-dispatch-2610012241bab6 em 2026-10-02T08:31:24-03:00 (hermes-db-migrar --nova)
--
-- Classe: CONTRATO. Contem APENAS o que ainda NAO esta aplicado no banco.
-- O que ja esta aplicado NAO se repete aqui (o guard do CI recusa conteudo de
-- migration ja existente): a parte aditiva 20261001351230_f51a_* criou a funcao
-- multiplix_confirm_dispatch, as colunas replied_at/reply_attribution e o indice
-- idx_multiplix_delivery_items_dispatch_replied.
--
-- O que falta: a ACL da RPC (REVOKE/GRANT), os COMMENTs, o CHECK de
-- reply_attribution, as duas funcoes de trigger de bump de versao e os triggers.
-- A RPC vai com CREATE OR REPLACE porque a funcao ja existe (a versao anterior,
-- 20261001341230, usava CREATE FUNCTION e abortava com 42723).
--
-- Depende de: 20261001351230_f51a_* (ja aplicada).

-- rollback: DROP TRIGGER IF EXISTS trg_multiplix_bump_version_on_block_change ON public.multiplix_blocks;
-- rollback: DROP FUNCTION IF EXISTS public.multiplix_bump_version_on_block_change();
-- rollback: DROP TRIGGER IF EXISTS trg_multiplix_bump_version_on_dispatch_edit ON public.multiplix_dispatches;
-- rollback: DROP FUNCTION IF EXISTS public.multiplix_bump_version_on_dispatch_edit();

-- ---------- 2. RPC de confirmacao ----------
-- OR REPLACE: a parte aditiva (20261001351230_f51a) ja criou esta funcao no banco de producao.
-- Sem OR REPLACE o migrador aborta com 42723 (function already exists with same argument types),
-- porque o ledger nunca registrou esta migration (ela nunca chegou a aplicar).
CREATE OR REPLACE FUNCTION public.multiplix_confirm_dispatch(
  p_dispatch_id uuid,
  p_actor_id uuid,
  p_allow_manage_all boolean,
  p_expected_version integer,
  p_scheduled_at timestamp with time zone DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE(
  dispatch_id uuid,
  dispatch_version integer,
  status public.multiplix_dispatch_status,
  recipient_count integer,
  block_count integer,
  items_created integer,
  items_total integer,
  created boolean,
  scheduled_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch      public.multiplix_dispatches%ROWTYPE;
  v_candidate     integer;
  v_confirmed     integer;
  v_scheduled     timestamp with time zone;
  v_recipients    integer;
  v_eligible      integer;
  v_blocks        integer;
  v_items_before  integer;
  v_items_created integer;
  v_new_status    public.multiplix_dispatch_status;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_dispatch_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'invalid_multiplix_confirm' USING ERRCODE = '22023';
  END IF;

  -- Serializa confirmacoes concorrentes do MESMO disparo: o 2o a chegar ve o efeito do 1o
  -- (e cai na idempotencia), em vez de materializar a fila duas vezes.
  SELECT * INTO v_dispatch
    FROM public.multiplix_dispatches AS d
   WHERE d.id = p_dispatch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Escopo: a edge ja resolveu dono/manage_all; a RPC reconfere (defesa em profundidade).
  IF v_dispatch.created_by IS DISTINCT FROM p_actor_id
     AND COALESCE(p_allow_manage_all, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'multiplix_dispatch_scope_denied' USING ERRCODE = '42501';
  END IF;

  -- ---- 1. idempotencia por (dispatch_id, dispatch_version) ----
  v_candidate := p_expected_version + 1;

  SELECT COALESCE(max(item.dispatch_version), 0) INTO v_confirmed
    FROM public.multiplix_delivery_items AS item
   WHERE item.dispatch_id = p_dispatch_id;

  IF v_confirmed > 0 THEN
    IF v_confirmed = v_candidate THEN
      SELECT count(*)::integer INTO v_recipients
        FROM public.multiplix_recipients AS r WHERE r.dispatch_id = p_dispatch_id;
      SELECT count(*)::integer INTO v_blocks
        FROM public.multiplix_blocks AS b WHERE b.dispatch_id = p_dispatch_id;
      SELECT count(*)::integer INTO v_items_created
        FROM public.multiplix_delivery_items AS item
       WHERE item.dispatch_id = p_dispatch_id AND item.dispatch_version = v_candidate;

      RETURN QUERY SELECT p_dispatch_id, v_candidate, v_dispatch.status,
                          v_recipients, v_blocks, 0, v_items_created, false, v_dispatch.scheduled_at;
      RETURN;
    END IF;
    -- Ja existe confirmacao em OUTRA versao: nao re-materializa em cima dela.
    RAISE EXCEPTION 'multiplix_dispatch_already_confirmed' USING ERRCODE = '55000';
  END IF;

  -- ---- 2. estado e revisao ----
  IF v_dispatch.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'multiplix_dispatch_not_confirmable' USING ERRCODE = '55000';
  END IF;

  IF v_dispatch.dispatch_version <> p_expected_version THEN
    RAISE EXCEPTION 'multiplix_dispatch_review_stale' USING ERRCODE = '55000';
  END IF;

  -- ---- 3. revalidacao (F49), ainda na transacao ----
  -- Nota de PONTE: o agendamento pode ja existir desde o draft.create (F31 grava
  -- status='scheduled' quando ha p_scheduled_at); por isso `scheduled` tambem e confirmavel.
  --
  -- ALINHAMENTO COM O F49: o predicado de "apto" e o MESMO balde `eligible` que o F49
  -- calcula em `bucketForRecipient` (inspect.ts): a classe PERSISTIDA em
  -- `multiplix_eligibility` conta como apta em ('eligible','media_pending',
  -- 'connection_unavailable','requires_template') — as 3 ultimas sao barreiras operacionais
  -- transitorias, o F49 as soma em `eligible` de proposito — E a linha precisa ter PESSOA
  -- (`singu_contact_id` OU `destino_e164`), que e o que separa 'eligible' de
  -- 'company_without_person'. Sem isso o confirm enfileiraria destinatario sem numero.
  v_scheduled := COALESCE(p_scheduled_at, v_dispatch.scheduled_at);

  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE r.eligibility IN ('eligible', 'media_pending', 'connection_unavailable', 'requires_template')
             AND (r.singu_contact_id IS NOT NULL OR r.destino_e164 IS NOT NULL)
         )::integer
    INTO v_recipients, v_eligible
    FROM public.multiplix_recipients AS r
   WHERE r.dispatch_id = p_dispatch_id;

  IF v_recipients = 0 THEN
    RAISE EXCEPTION 'multiplix_confirm_no_recipients' USING ERRCODE = '22023';
  END IF;
  IF v_eligible = 0 THEN
    RAISE EXCEPTION 'multiplix_confirm_no_eligible_recipients' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_blocks
    FROM public.multiplix_blocks AS b
   WHERE b.dispatch_id = p_dispatch_id;

  IF v_blocks = 0 THEN
    RAISE EXCEPTION 'multiplix_confirm_no_blocks' USING ERRCODE = '22023';
  END IF;

  IF v_dispatch.whatsapp_connection_id IS NULL THEN
    RAISE EXCEPTION 'multiplix_confirm_connection_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.whatsapp_connections AS c
     WHERE c.id = v_dispatch.whatsapp_connection_id
       AND c.status = 'connected'
  ) THEN
    RAISE EXCEPTION 'multiplix_confirm_connection_unavailable' USING ERRCODE = '22023';
  END IF;

  -- ---- 4. congelamento do publico e dos blocos ----
  -- Publico: carimba a versao da audiencia e grava o snapshot por destinatario (identidade e
  -- motivo de inclusao; o destino E164 ja vive na propria linha e nao e duplicado aqui).
  UPDATE public.multiplix_recipients AS r
     SET audience_version = v_candidate,
         variables_snapshot = COALESCE(r.variables_snapshot, '{}'::jsonb)
           || jsonb_strip_nulls(jsonb_build_object(
                'audience_version', v_candidate,
                'frozen_at', statement_timestamp(),
                'company_id', r.company_id,
                'company_name', r.company_name_snapshot,
                'eligibility', r.eligibility::text,
                'inclusion_reason', r.inclusion_reason
              )),
         updated_at = statement_timestamp()
   WHERE r.dispatch_id = p_dispatch_id;

  -- Blocos: congela o HASH EXATO do conteudo confirmado (F33 `content`); `content_version`
  -- continua sendo o metadado de EDICAO (F45), nao desta operacao.
  UPDATE public.multiplix_blocks AS b
     SET content_hash = encode(extensions.digest(b.content::text, 'sha256'), 'hex'),
         updated_at = statement_timestamp()
   WHERE b.dispatch_id = p_dispatch_id;

  -- ---- 5. materializacao da fila (UMA linha por destinatario elegivel x bloco) ----
  SELECT count(*)::integer INTO v_items_before
    FROM public.multiplix_delivery_items AS item
   WHERE item.dispatch_id = p_dispatch_id;

  INSERT INTO public.multiplix_delivery_items AS item (
    dispatch_id, recipient_id, block_id, dispatch_version, status, next_attempt_at
  )
  SELECT p_dispatch_id, r.id, b.id, v_candidate, 'pending',
         CASE WHEN v_scheduled IS NOT NULL THEN v_scheduled END
    FROM public.multiplix_recipients AS r
    CROSS JOIN public.multiplix_blocks AS b
   WHERE r.dispatch_id = p_dispatch_id
     AND b.dispatch_id = p_dispatch_id
     -- mesmo predicado de apto do F49 (balde `eligible`), ver comentario no passo 3
     AND r.eligibility IN ('eligible', 'media_pending', 'connection_unavailable', 'requires_template')
     AND (r.singu_contact_id IS NOT NULL OR r.destino_e164 IS NOT NULL)
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_items_created = ROW_COUNT;

  -- ---- 6. estado final do disparo ----
  v_new_status := CASE WHEN v_scheduled IS NOT NULL
                       THEN 'scheduled'::public.multiplix_dispatch_status
                       ELSE 'sending'::public.multiplix_dispatch_status
                  END;

  UPDATE public.multiplix_dispatches AS d
     SET dispatch_version = v_candidate,
         audience_version = v_candidate,
         status = v_new_status,
         scheduled_at = v_scheduled,
         total_recipients = v_eligible,
         started_at = CASE WHEN v_scheduled IS NULL THEN statement_timestamp() ELSE d.started_at END,
         updated_at = statement_timestamp()
   WHERE d.id = p_dispatch_id;

  -- ---- 7. trilha (F34/F43) ----
  INSERT INTO public.multiplix_events (dispatch_id, kind, payload, correlation_id)
  VALUES (
    p_dispatch_id,
    CASE WHEN v_new_status = 'scheduled' THEN 'dispatch_scheduled' ELSE 'dispatch_started' END,
    jsonb_build_object(
      'dispatch_version', v_candidate,
      'recipients', v_eligible,
      'blocks', v_blocks,
      'items', v_items_created,
      'actor_id', p_actor_id
    ),
    p_correlation_id
  );

  RETURN QUERY SELECT p_dispatch_id, v_candidate, v_new_status,
                      v_eligible, v_blocks, v_items_created, v_items_before + v_items_created,
                      true, v_scheduled;
END;
$function$;

REVOKE ALL ON FUNCTION public.multiplix_confirm_dispatch(uuid, uuid, boolean, integer, timestamp with time zone, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.multiplix_confirm_dispatch(uuid, uuid, boolean, integer, timestamp with time zone, uuid) TO service_role;

COMMENT ON FUNCTION public.multiplix_confirm_dispatch(uuid, uuid, boolean, integer, timestamp with time zone, uuid) IS
  'F51: confirma o disparo numa transacao — revalida (F49), congela publico/blocos, avanca '
  'dispatch_version e materializa multiplix_delivery_items. Idempotente por '
  '(dispatch_id, dispatch_version). service_role apenas.';

-- ===========================================================================
-- F05 (fechamento da lacuna declarada pelo F51): a versao do rascunho sobe
-- SEMPRE, no BANCO, nao no TS.
--
-- Por que no banco: o `confirm` (F51) e idempotente por
-- (dispatch_id, dispatch_version) e recusa revisao desatualizada. Se o bump
-- dependesse de cada handler lembrar de incrementar, um caminho novo de edicao
-- (ou um UPDATE direto de script) reabriria o furo em silencio — foi
-- exatamente o que o F51 encontrou. O trigger fecha TODOS os caminhos de uma vez.
--
-- Regra de ouro: o trigger SO age enquanto o dispatch esta em `draft`. O
-- `confirm` faz o seu proprio incremento e TROCA o status na mesma transacao,
-- entao nao existe incremento duplo.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.multiplix_bump_version_on_dispatch_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- So rascunho: o congelamento do confirm muda o status e e ele quem versiona.
  IF OLD.status <> 'draft' OR NEW.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  -- Metadados de trabalho (a propria versao, timestamps, contadores) nao sao
  -- "revisao": mudar so eles nao pode invalidar uma previa ja revisada.
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.template IS DISTINCT FROM OLD.template
     OR NEW.whatsapp_connection_id IS DISTINCT FROM OLD.whatsapp_connection_id
     OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR NEW.audience_version IS DISTINCT FROM OLD.audience_version
     OR NEW.variables_snapshot IS DISTINCT FROM OLD.variables_snapshot THEN
    NEW.dispatch_version := OLD.dispatch_version + 1;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.multiplix_bump_version_on_dispatch_edit() IS
  'F05: incrementa dispatch_version quando o rascunho e editado (nome, template, conexao, agendamento, publico ou variaveis). Inerte fora de draft.';

DROP TRIGGER IF EXISTS trg_multiplix_bump_version_on_dispatch_edit ON public.multiplix_dispatches;
CREATE TRIGGER trg_multiplix_bump_version_on_dispatch_edit
  BEFORE UPDATE ON public.multiplix_dispatches
  FOR EACH ROW
  EXECUTE FUNCTION public.multiplix_bump_version_on_dispatch_edit();

-- Editar um BLOCO tambem e revisar o rascunho: sobe a versao do dispatch pai.
CREATE OR REPLACE FUNCTION public.multiplix_bump_version_on_block_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_dispatch_id uuid;
BEGIN
  v_dispatch_id := COALESCE(NEW.dispatch_id, OLD.dispatch_id);

  UPDATE public.multiplix_dispatches
     SET dispatch_version = dispatch_version + 1
   WHERE id = v_dispatch_id
     AND status = 'draft';

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

COMMENT ON FUNCTION public.multiplix_bump_version_on_block_change() IS
  'F05: mexer em bloco revisa o rascunho — incrementa dispatch_version do dispatch pai (so em draft).';

DROP TRIGGER IF EXISTS trg_multiplix_bump_version_on_block_change ON public.multiplix_blocks;
CREATE TRIGGER trg_multiplix_bump_version_on_block_change
  AFTER INSERT OR UPDATE OR DELETE ON public.multiplix_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.multiplix_bump_version_on_block_change();

REVOKE ALL ON FUNCTION public.multiplix_bump_version_on_dispatch_edit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.multiplix_bump_version_on_block_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.multiplix_bump_version_on_dispatch_edit() TO service_role;
GRANT EXECUTE ON FUNCTION public.multiplix_bump_version_on_block_change() TO service_role;

-- rollback: DROP TRIGGER IF EXISTS trg_multiplix_bump_version_on_block_change ON public.multiplix_blocks;
-- rollback: DROP FUNCTION IF EXISTS public.multiplix_bump_version_on_block_change();
-- rollback: DROP TRIGGER IF EXISTS trg_multiplix_bump_version_on_dispatch_edit ON public.multiplix_dispatches;
-- rollback: DROP FUNCTION IF EXISTS public.multiplix_bump_version_on_dispatch_edit();
