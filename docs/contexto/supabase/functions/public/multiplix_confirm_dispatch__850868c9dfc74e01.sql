CREATE OR REPLACE FUNCTION public.multiplix_confirm_dispatch(p_dispatch_id uuid, p_actor_id uuid, p_allow_manage_all boolean, p_expected_version integer, p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_correlation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(dispatch_id uuid, dispatch_version integer, status multiplix_dispatch_status, recipient_count integer, block_count integer, items_created integer, items_total integer, created boolean, scheduled_at timestamp with time zone)
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
  v_connection    uuid;
  v_legacy        boolean;
  v_bridge_block  boolean := false;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_dispatch_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'invalid_multiplix_confirm' USING ERRCODE = '22023';
  END IF;

  -- Serializa confirmacoes concorrentes do MESMO disparo.
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
  -- 'paused' sem fila (chegou ate aqui: v_confirmed = 0) e o legado da 20261005150259 — ou
  -- qualquer pausado que nunca materializou. Iniciar esse disparo e a mesma decisao
  -- irreversivel de iniciar um rascunho, entao passa pela MESMA confirmacao.
  IF v_dispatch.status NOT IN ('draft', 'scheduled', 'paused') THEN
    RAISE EXCEPTION 'multiplix_dispatch_not_confirmable' USING ERRCODE = '55000';
  END IF;
  v_legacy := v_dispatch.status = 'paused';

  IF v_dispatch.dispatch_version <> p_expected_version THEN
    RAISE EXCEPTION 'multiplix_dispatch_review_stale' USING ERRCODE = '55000';
  END IF;

  -- ---- 3. revalidacao (F49), ainda na transacao ----
  v_scheduled := COALESCE(p_scheduled_at, v_dispatch.scheduled_at);
  -- Legado: um agendamento antigo ja vencido nao e "agendar" — e envio imediato.
  IF v_legacy AND v_scheduled IS NOT NULL AND v_scheduled <= statement_timestamp() THEN
    v_scheduled := NULL;
  END IF;

  -- Apto = MESMO balde `eligible` do F49 (classe persistida + pessoa). So destinatario ainda
  -- 'pending' entra: no legado, quem ja saiu pela fila antiga nunca recebe de novo; no
  -- rascunho todos estao 'pending'.
  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE r.status = 'pending'
             AND r.eligibility IN ('eligible', 'media_pending', 'connection_unavailable', 'requires_template')
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
    -- Rascunho do composer / legado: o texto do disparo vira o bloco unico (inserido no
    -- passo 5, depois da troca de status). Texto vazio nao vira fila.
    IF btrim(COALESCE(v_dispatch.message_template, '')) = '' THEN
      RAISE EXCEPTION 'multiplix_confirm_no_blocks' USING ERRCODE = '22023';
    END IF;
    v_bridge_block := true;
    v_blocks := 1;
  END IF;

  -- Conexao: a do disparo; sem uma, a primeira conectada (mesma regra do worker — o
  -- composer nao oferece escolha). Ordem estavel para a escolha nao variar entre chamadas.
  v_connection := v_dispatch.whatsapp_connection_id;
  IF v_connection IS NULL THEN
    SELECT c.id INTO v_connection
      FROM public.whatsapp_connections AS c
     WHERE c.status = 'connected'
     ORDER BY c.created_at, c.id
     LIMIT 1;
  END IF;
  IF v_connection IS NULL THEN
    RAISE EXCEPTION 'multiplix_confirm_connection_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.whatsapp_connections AS c
     WHERE c.id = v_connection
       AND c.status = 'connected'
  ) THEN
    RAISE EXCEPTION 'multiplix_confirm_connection_unavailable' USING ERRCODE = '22023';
  END IF;

  -- ---- 4. estado final do disparo (ANTES de mexer em bloco) ----
  -- Sair de 'draft' primeiro deixa o gatilho de versao do F05 inerte para o resto da
  -- transacao: o bloco criado/hasheado abaixo nao versiona por cima do confirm.
  v_new_status := CASE WHEN v_scheduled IS NOT NULL
                       THEN 'scheduled'::public.multiplix_dispatch_status
                       ELSE 'sending'::public.multiplix_dispatch_status
                  END;

  UPDATE public.multiplix_dispatches AS d
     SET dispatch_version = v_candidate,
         audience_version = v_candidate,
         status = v_new_status,
         scheduled_at = v_scheduled,
         whatsapp_connection_id = v_connection,
         -- Legado preserva o total original (o progresso conta quem ja saiu pela fila antiga).
         total_recipients = CASE WHEN v_legacy THEN d.total_recipients ELSE v_eligible END,
         pause_reason = NULL,
         started_at = CASE WHEN v_scheduled IS NULL
                           THEN COALESCE(d.started_at, statement_timestamp())
                           ELSE d.started_at END,
         updated_at = statement_timestamp()
   WHERE d.id = p_dispatch_id;

  -- ---- 5. congelamento do publico e dos blocos ----
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

  IF v_bridge_block THEN
    INSERT INTO public.multiplix_blocks (dispatch_id, block_order, block_type, content)
    VALUES (p_dispatch_id, 1, 'text', jsonb_build_object('text', v_dispatch.message_template));
  END IF;

  UPDATE public.multiplix_blocks AS b
     SET content_hash = encode(extensions.digest(b.content::text, 'sha256'), 'hex'),
         updated_at = statement_timestamp()
   WHERE b.dispatch_id = p_dispatch_id;

  -- ---- 6. materializacao da fila (UMA linha por destinatario apto x bloco) ----
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
     AND r.status = 'pending'
     AND r.eligibility IN ('eligible', 'media_pending', 'connection_unavailable', 'requires_template')
     AND (r.singu_contact_id IS NOT NULL OR r.destino_e164 IS NOT NULL)
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_items_created = ROW_COUNT;

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
      'actor_id', p_actor_id,
      'legacy_paused', v_legacy,
      'block_from_template', v_bridge_block
    ),
    p_correlation_id
  );

  RETURN QUERY SELECT p_dispatch_id, v_candidate, v_new_status,
                      v_eligible, v_blocks, v_items_created, v_items_before + v_items_created,
                      true, v_scheduled;
END;
$function$
