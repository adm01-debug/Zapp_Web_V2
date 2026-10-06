-- mx01_legacy_queue_materialize
-- versão 20261005150259 reservada para hermes-composer-materializa-fila-2610051151125f (hermes-db-migrar --nova)
--
-- Rollback: UPDATE public.multiplix_dispatches AS d SET status = 'sending', pause_reason = NULL, paused_at = NULL WHERE d.status = 'paused' AND d.pause_reason = 'legacy_queue_unmaterialized' AND NOT EXISTS (SELECT 1 FROM public.multiplix_delivery_items AS item WHERE item.dispatch_id = d.id); DROP FUNCTION IF EXISTS public.multiplix_materialize_legacy_queue(uuid, uuid);
-- Rollback honesto: mensagem enviada depois de uma retomada manual nao tem rollback.
--
-- MX01 (BACKLOG_VERIFICADO item 45 / achado MX01 da reconciliacao TALKX_MULTIPLIX):
-- "Composer inicia rascunho sem materializar a fila por itens".
--
-- O composer cria o disparo pela RPC `multiplix_create_draft` (SOMENTE
-- `multiplix_dispatches` + `multiplix_recipients`, nenhum bloco/item) e chama
-- `multiplix-send/start` logo em seguida. O worker novo, porem, consome
-- EXCLUSIVAMENTE `multiplix_delivery_items`: sem materializar a fila, o disparo
-- entrava em 'sending' com destinatarios pendentes e ZERO itens processaveis —
-- nada era enviado e nenhum erro aparecia ("sucesso" silencioso).
--
-- Esta funcao e a CONVERSAO EXPLICITA E IDEMPOTENTE do rascunho legado. Antes
-- de cria-la, a migration pausa todo legado que ja estava em 'sending' sem fila:
-- ele so volta a 'sending' pelo clique Retomar no Monitor. O worker chama esta
-- funcao depois da transicao manual e ANTES do loop de envio. A forma da fila e
-- a MESMA do `multiplix_confirm_dispatch`
-- (F51): um item por (destinatario elegivel x bloco), com a idempotencia vinda do
-- `idempotency_key` gerado (UNIQUE), entao repetir a chamada nao duplica item.
--
-- Guard de conteudo (rodada 2 do cartao): um rascunho legado com
-- `message_template` vazio ou so espacos NAO vira fila — a funcao lanca
-- 'multiplix_legacy_empty_template' (SQLSTATE 22023) ANTES de inserir bloco ou
-- item, entao nao sobra nem bloco parcial. Sem o guard, o COALESCE antigo
-- gravava um bloco com texto '' e a fila mandaria mensagem em branco a
-- contatos reais.
--
-- Por que nao reusar o `multiplix_confirm_dispatch`: ele exige status
-- draft/scheduled, bloco ja criado e conexao escolhida — nada disso existe no
-- rascunho legado do composer. E materializar com o dispatch ainda em 'draft'
-- esbarra no trigger de versionamento do F05 (`multiplix_bump_version_on_block_change`
-- -> UPDATE no dispatch -> `multiplix_bump_version_on_dispatch_edit`, que le
-- NEW.template, coluna inexistente nesta base: 42703). Com o dispatch em
-- 'sending' as duas guardas sao inertes (a de versao so age em 'draft').
--
-- Depende de: F30 (enum multiplix_item_status/eligibility), F31
-- (dispatch_version, singu_contact_id), F32a (multiplix_delivery_items),
-- F33 (multiplix_blocks.content), F34 (multiplix_events).

-- Gate de seguranca do legado: a migration roda uma unica vez e transforma
-- qualquer envio antigo sem fila em decisao explicita do operador. O predicado
-- NOT EXISTS evita tocar disparos novos que ja possuem fila materializada.
UPDATE public.multiplix_dispatches AS d
   SET status = 'paused',
       pause_reason = 'legacy_queue_unmaterialized',
       paused_at = now()
 WHERE d.status = 'sending'
   AND NOT EXISTS (
     SELECT 1
       FROM public.multiplix_delivery_items AS item
      WHERE item.dispatch_id = d.id
   );

CREATE FUNCTION public.multiplix_materialize_legacy_queue(
  p_dispatch_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE(items_created integer, items_total integer, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch public.multiplix_dispatches%ROWTYPE;
  v_existing integer;
  v_blocks   integer;
  v_eligible integer;
  v_created  integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_dispatch_id IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_materialize' USING ERRCODE = '22023';
  END IF;

  -- Serializa materializacoes concorrentes do MESMO disparo (duas passadas do
  -- cron, ou cron + clique): o 2o a chegar ve os itens do 1o e sai no no-op.
  SELECT * INTO v_dispatch
    FROM public.multiplix_dispatches AS d
   WHERE d.id = p_dispatch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer INTO v_existing
    FROM public.multiplix_delivery_items AS item
   WHERE item.dispatch_id = p_dispatch_id;

  -- Ja materializada (fluxo novo do F51/F72, ou passada anterior do worker):
  -- NO-OP. Fora de 'sending' (pausado/cancelado/concluido) tambem: nao se
  -- enfileira item novo para um disparo que nao esta andando.
  IF v_existing > 0 OR v_dispatch.status <> 'sending' THEN
    RETURN QUERY SELECT 0, v_existing, false;
    RETURN;
  END IF;

  SELECT count(*)::integer INTO v_blocks
    FROM public.multiplix_blocks AS b
   WHERE b.dispatch_id = p_dispatch_id;

  IF v_blocks = 0 THEN
    -- Rascunho legado SEM TEXTO nao pode virar fila: um bloco vazio geraria
    -- itens enviaveis de mensagem em branco para contatos reais. Recusa ANTES
    -- de qualquer INSERT — o RAISE desfaz a funcao inteira, sem bloco parcial.
    IF btrim(COALESCE(v_dispatch.message_template, '')) = '' THEN
      RAISE EXCEPTION 'multiplix_legacy_empty_template' USING ERRCODE = '22023';
    END IF;
    -- Rascunho legado nao tem bloco: o `message_template` do disparo vira o
    -- bloco unico (block_order 1) — `multiplix_delivery_items.block_id` e NOT
    -- NULL e a fila e (destinatario x bloco). O guard acima garante nao-vazio,
    -- entao nao ha COALESCE aqui.
    INSERT INTO public.multiplix_blocks (dispatch_id, block_order, block_type, content)
    VALUES (
      p_dispatch_id,
      1,
      'text',
      jsonb_build_object('text', v_dispatch.message_template)
    );
    v_blocks := 1;
  END IF;

  -- Mesmo predicado de "apto" do F49/F51: so destinatario com PESSOA (contato do
  -- Singu OU destino E.164) vira item; sem isso a fila nasceria inenviável.
  SELECT count(*)::integer INTO v_eligible
    FROM public.multiplix_recipients AS r
   WHERE r.dispatch_id = p_dispatch_id
     AND r.status = 'pending'
     AND r.eligibility IN ('eligible', 'media_pending', 'connection_unavailable', 'requires_template')
     AND (r.singu_contact_id IS NOT NULL OR r.destino_e164 IS NOT NULL);

  INSERT INTO public.multiplix_delivery_items AS item (
    dispatch_id, recipient_id, block_id, dispatch_version, status
  )
  SELECT p_dispatch_id, r.id, b.id, v_dispatch.dispatch_version, 'pending'
    FROM public.multiplix_recipients AS r
    CROSS JOIN public.multiplix_blocks AS b
   WHERE r.dispatch_id = p_dispatch_id
     AND b.dispatch_id = p_dispatch_id
     AND r.status = 'pending'
     AND r.eligibility IN ('eligible', 'media_pending', 'connection_unavailable', 'requires_template')
     AND (r.singu_contact_id IS NOT NULL OR r.destino_e164 IS NOT NULL)
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;

  INSERT INTO public.multiplix_events (dispatch_id, kind, payload, correlation_id)
  VALUES (
    p_dispatch_id,
    -- 'item_queued' e o vocabulario do CHECK da F34 para item entrando na fila
    -- (nao existe kind novo para conversao legada; nao se acrescenta um agora).
    'item_queued',
    jsonb_build_object(
      'items_created', v_created,
      'recipients', v_eligible,
      'blocks', v_blocks
    ),
    p_correlation_id
  );

  RETURN QUERY SELECT v_created, v_created, true;
END;
$function$;

REVOKE ALL ON FUNCTION public.multiplix_materialize_legacy_queue(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.multiplix_materialize_legacy_queue(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.multiplix_materialize_legacy_queue(uuid, uuid) IS
  'MX01: materializa a fila por itens de um rascunho LEGADO (dispatch + recipients, sem bloco/item) '
  'com o worker ja em ''sending''. Cria o bloco texto do message_template quando faltar e insere '
  'destinatario elegivel x bloco de forma idempotente (idempotency_key). Template vazio/so espacos '
  'e recusado: multiplix_legacy_empty_template (22023). service_role apenas.';
