-- f51a: parte ADITIVA PURA do F51 — a FUNCAO nova, as COLUNAS novas e o INDICE novo.
--
-- Por que existe separada (medido, nao suposto): o `supabase-usage-guard` projeta o
-- schema pelas migrations com data >= `generated_at` do catalogo (aqui 20261002) e a
-- versao reservada do F51 (20261001...) cai FORA dessa janela. Como `actions/lifecycle.ts`
-- chama `multiplix_confirm_dispatch`, o alvo precisa EXISTIR de verdade antes do CI — e
-- este arquivo, sendo aditivo, e aplicado na propria tarefa.
--
-- O que NAO esta aqui (segue na f51, aplicada pos-merge como contrato):
--   - o CHECK `multiplix_delivery_items_reply_attribution_check` (DROP + ADD CONSTRAINT);
--   - REVOKE/GRANT e COMMENT da funcao;
--   - os triggers de versionamento (F05), que usam CREATE OR REPLACE + DROP TRIGGER.
--
-- rollback: DROP FUNCTION IF EXISTS public.multiplix_confirm_dispatch(uuid, uuid, boolean, integer, timestamp with time zone, uuid);
-- rollback: DROP INDEX IF EXISTS public.idx_multiplix_delivery_items_dispatch_replied;
-- rollback: ALTER TABLE public.multiplix_delivery_items DROP COLUMN IF EXISTS reply_attribution;
-- rollback: ALTER TABLE public.multiplix_delivery_items DROP COLUMN IF EXISTS replied_at;

CREATE FUNCTION public.multiplix_confirm_dispatch(
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


ALTER TABLE public.multiplix_delivery_items
  ADD COLUMN IF NOT EXISTS replied_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS reply_attribution text;

CREATE INDEX IF NOT EXISTS idx_multiplix_delivery_items_dispatch_replied
  ON public.multiplix_delivery_items (dispatch_id)
  WHERE replied_at IS NOT NULL;
