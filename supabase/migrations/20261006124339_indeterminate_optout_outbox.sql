-- indeterminate_optout_outbox
-- Rollback: DROP FUNCTION IF EXISTS public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz, boolean, text, text, text);
--   DELETE FROM public.inbound_message_effects WHERE effect = 'optout_resolve';
--   ALTER TABLE public.inbound_message_effects
--     DROP CONSTRAINT IF EXISTS inbound_message_effects_effect_check,
--     ADD CONSTRAINT inbound_message_effects_effect_check
--       CHECK (effect IN ('optout_suppress', 'talkx_reply', 'multiplix_reply'));
--   CREATE OR REPLACE FUNCTION public.drain_inbound_message_effects(p_connection_id uuid, p_external_id text)
--   RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
--   DECLARE
--     v_row record;
--     v_message_id uuid;
--     v_suppression_id uuid;
--     v_optout_status text;
--     v_talkx jsonb;
--     v_multiplix jsonb;
--     v_failed integer := 0;
--     v_phone_digits text;
--     v_reply_message_id uuid;
--   BEGIN
--     IF coalesce(auth.role(), '') <> 'service_role' THEN
--       RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
--     END IF;
--     IF p_connection_id IS NULL OR coalesce(p_external_id, '') = '' THEN
--       RAISE EXCEPTION 'invalid_inbound_effects_key' USING ERRCODE = '22023';
--     END IF;
--     SELECT m.id INTO v_message_id
--     FROM public.messages m
--     WHERE m.whatsapp_connection_id = p_connection_id AND m.sender = 'contact' AND m.external_id = p_external_id
--     ORDER BY m.created_at DESC
--     LIMIT 1;
--     FOR v_row IN
--       SELECT e.id, e.effect, e.payload FROM public.inbound_message_effects e
--        WHERE e.whatsapp_connection_id = p_connection_id
--          AND e.external_id = p_external_id
--          AND e.applied_at IS NULL
--        ORDER BY e.created_at, e.id
--        FOR UPDATE OF e
--     LOOP
--       UPDATE public.inbound_message_effects SET attempts = attempts + 1 WHERE id = v_row.id;
--       BEGIN
--         CASE v_row.effect
--           WHEN 'optout_suppress' THEN
--             v_phone_digits := regexp_replace(coalesce(v_row.payload ->> 'phone', ''), '\D', '', 'g');
--             IF length(v_phone_digits) < 8 THEN
--               v_optout_status := 'invalid_phone';
--             ELSIF EXISTS (
--               SELECT 1 FROM public.talkx_recipients r
--                WHERE r.contact_id = (v_row.payload ->> 'contact_id')::uuid
--                  AND r.sent_at IS NOT NULL
--                  AND r.sent_at >= statement_timestamp() - interval '30 days'
--             ) THEN
--               v_suppression_id := public.talkx_suppress_contact(
--                 (v_row.payload ->> 'contact_id')::uuid, v_row.payload ->> 'phone',
--                 'Opt-out via mensagem: ' || (v_row.payload ->> 'keyword'), 'opt_out', 'auto_optout',
--                 coalesce((v_row.payload ->> 'message_id')::uuid, v_message_id));
--               v_optout_status := CASE WHEN v_suppression_id IS NOT NULL THEN 'suppressed' ELSE 'already_suppressed' END;
--             ELSE
--               v_optout_status := 'no_recent_send';
--             END IF;
--           WHEN 'talkx_reply' THEN
--             v_reply_message_id := coalesce((v_row.payload ->> 'message_id')::uuid, v_message_id);
--             IF v_reply_message_id IS NULL THEN
--               v_talkx := jsonb_build_object('attributed', false, 'attribution', null, 'reason', 'message_missing');
--             ELSE
--               v_talkx := public.attribute_talkx_reply(
--                 (v_row.payload ->> 'contact_id')::uuid, v_row.payload ->> 'phone', v_reply_message_id);
--             END IF;
--           WHEN 'multiplix_reply' THEN
--             v_multiplix := public.attribute_multiplix_item_reply(
--               v_row.payload ->> 'phone',
--               coalesce(v_row.payload ->> 'message_id', v_message_id::text),
--               v_row.payload ->> 'quoted_external_id');
--           ELSE
--             RAISE EXCEPTION 'invalid_inbound_effect: %', v_row.effect USING ERRCODE = '22023';
--         END CASE;
--         UPDATE public.inbound_message_effects
--            SET applied_at = statement_timestamp(), last_error = NULL
--          WHERE id = v_row.id;
--       EXCEPTION WHEN OTHERS THEN
--         v_failed := v_failed + 1;
--         UPDATE public.inbound_message_effects SET last_error = SQLERRM WHERE id = v_row.id;
--       END;
--     END LOOP;
--     RETURN jsonb_build_object(
--       'suppression_id', v_suppression_id,
--       'optout_status', v_optout_status,
--       'talkx_reply', v_talkx,
--       'multiplix_reply', v_multiplix,
--       'pending_failed', v_failed
--     );
--   END;
--   $function$;
--   REVOKE ALL ON FUNCTION public.drain_inbound_message_effects(uuid, text) FROM PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.drain_inbound_message_effects(uuid, text) TO service_role;
--   COMMENT ON FUNCTION public.drain_inbound_message_effects(uuid, text) IS 'R2-API-006: aplica e baixa cada pendencia da outbox na mesma transacao; falha fica em last_error e a reentrega retenta. Retorna suppression_id novo (autoresposta 1x), optout_status e atribuicoes. So service_role.';
--
-- #190: resolveOptOutKeyword devolvia NULL tanto para "nao casou" quanto para
-- "nao conseguiu decidir" (leitura de talkx_optout_keywords E talkx_match_optout
-- falharam) — o ingest entao enfileirava atribuicao para um texto que podia ser
-- opt-out. Contrato explicito de decisao no ingest:
--
--   p_opt_out_decision (10o arg, OBRIGATORIO, pode ser NULL):
--     'matched'       -> efeito optout_suppress (como antes; exige p_opt_out_keyword)
--     'not_matched'   -> efeitos talkx_reply + multiplix_reply (como antes)
--     'indeterminate' -> efeito NOVO 'optout_resolve': resolucao de opt-out
--                        pendente junto da mensagem; NENHUMA atribuicao e criada
--     NULL            -> opt-out nao avaliado (fromMe ou mensagem nao-texto):
--                        segue o caminho de not_matched (efeitos de resposta),
--                        sujeito a guarda p_from_me
--
-- A drenagem reavalia o 'optout_resolve' chamando talkx_match_optout (fonte
-- autoritativa — ela mesma le talkx_optout_keywords):
--   casou      -> aplica SOMENTE a supressao (mesmo gate de 30 dias e mesma
--                 idempotencia do optout_suppress);
--   nao casou  -> libera UMA vez as atribuicoes aplicaveis (talkx_reply e
--                 multiplix_reply, com a citacao guardada no payload);
--   excecao    -> indeterminado persiste: last_error na linha, applied_at nulo,
--                 pending_failed>0 — o webhook devolve 500 e a Evolution
--                 reentrega para nova drenagem.
--
-- A assinatura de 11 args (edge anterior ao #190) e MANTIDA intacta: durante o
-- deploy escalonado ela continua mapeando palavra -> suppress e NULL ->
-- atribuicoes, exatamente o comportamento que o codigo antigo ja tinha. Os 12
-- parametros novos sao TODOS obrigatorios (sem DEFAULT): as aridades ficam
-- disjuntas (9-11 vs exatamente 12) e nenhuma chamada fica ambigua (42725).

ALTER TABLE public.inbound_message_effects
  DROP CONSTRAINT IF EXISTS inbound_message_effects_effect_check,
  ADD CONSTRAINT inbound_message_effects_effect_check
    CHECK (effect IN ('optout_suppress', 'talkx_reply', 'multiplix_reply', 'optout_resolve'));

COMMENT ON CONSTRAINT inbound_message_effects_effect_check ON public.inbound_message_effects IS
  '#190: optout_resolve = resolucao de opt-out pendente (decisao indeterminate no ingest); drenada por reavaliacao via talkx_match_optout.';

CREATE OR REPLACE FUNCTION public.ingest_inbound_message(
  p_connection_id uuid,
  p_phone text,
  p_push_name text,
  p_content text,
  p_message_type text,
  p_media_url text,
  p_external_id text,
  p_created_at timestamptz,
  p_from_me boolean,
  p_opt_out_decision text,
  p_opt_out_keyword text,
  p_quoted_external_id text
)
 RETURNS TABLE(contact_id uuid, contact_name text, assigned_to uuid, avatar_url text, contact_created boolean, message_id uuid, outcome text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_variants text[] := public.phone_variants(p_phone);
  v_clean text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_canonical text;
  v_contact record;
  v_created boolean := false;
  v_existing record;
  v_message_id uuid;
  v_outcome text;
  v_status text;
  v_content text;
BEGIN
  -- #190: o contrato de decisao e fechado — invalido ou incoerente aborta a
  -- transacao inteira (a entrega falha e o produtor reenvia; nada meio-escrito).
  IF p_opt_out_decision IS NOT NULL
     AND p_opt_out_decision NOT IN ('matched', 'not_matched', 'indeterminate') THEN
    RAISE EXCEPTION 'invalid_opt_out_decision: %', p_opt_out_decision USING ERRCODE = '22023';
  END IF;
  IF p_opt_out_decision = 'matched' AND nullif(p_opt_out_keyword, '') IS NULL THEN
    RAISE EXCEPTION 'opt_out_keyword_required_when_matched' USING ERRCODE = '22023';
  END IF;
  IF p_opt_out_decision IS DISTINCT FROM 'matched' AND p_opt_out_keyword IS NOT NULL THEN
    RAISE EXCEPTION 'opt_out_keyword_only_when_matched' USING ERRCODE = '22023';
  END IF;

  -- Forma canonica: BR com 13 digitos e 9o digito vira a forma de 12; o resto fica como esta.
  v_canonical := CASE
    WHEN v_clean LIKE '55%' AND length(v_clean) = 13 AND substr(v_clean, 5, 1) = '9'
      THEN substr(v_clean, 1, 4) || substr(v_clean, 6)
    ELSE v_clean
  END;
  PERFORM pg_advisory_xact_lock(hashtext('ingest_inbound_message:' || v_canonical));

  SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact
  FROM public.contacts c
  WHERE c.phone = ANY(v_variants) AND c.whatsapp_connection_id = p_connection_id
  ORDER BY c.created_at
  LIMIT 1;

  IF v_contact.id IS NULL THEN
    SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact
    FROM public.contacts c
    WHERE c.phone = ANY(v_variants)
    ORDER BY c.created_at
    LIMIT 1;

    IF v_contact.id IS NOT NULL THEN
      UPDATE public.contacts SET whatsapp_connection_id = p_connection_id, updated_at = now() WHERE id = v_contact.id;
    ELSE
      INSERT INTO public.contacts (phone, name, whatsapp_connection_id)
      VALUES (p_phone, coalesce(nullif(p_push_name, ''), p_phone), p_connection_id)
      ON CONFLICT (phone) DO NOTHING
      RETURNING contacts.id, contacts.name, contacts.assigned_to, contacts.avatar_url INTO v_contact;

      IF v_contact.id IS NULL THEN
        SELECT c.id, c.name, c.assigned_to, c.avatar_url INTO v_contact
        FROM public.contacts c
        WHERE c.phone = ANY(v_variants)
        ORDER BY c.created_at
        LIMIT 1;
        IF v_contact.id IS NULL THEN
          RAISE EXCEPTION 'ingest_inbound_message: contato % nao encontrado apos conflito', p_phone USING ERRCODE = 'P0002';
        END IF;
        UPDATE public.contacts SET whatsapp_connection_id = p_connection_id, updated_at = now() WHERE id = v_contact.id;
      ELSE
        v_created := true;
      END IF;
    END IF;
  END IF;

  SELECT m.id, m.status, m.content INTO v_existing
  FROM public.messages m
  WHERE m.whatsapp_connection_id = p_connection_id AND m.sender = 'contact' AND m.external_id = p_external_id
  ORDER BY m.created_at DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    v_status := CASE WHEN v_existing.status IS NOT NULL AND v_existing.status <> 'received' THEN v_existing.status ELSE 'received' END;
    v_content := CASE WHEN v_existing.status = 'deleted' THEN coalesce(v_existing.content, '[Mensagem apagada]') ELSE p_content END;
    UPDATE public.messages
    SET contact_id = v_contact.id, whatsapp_connection_id = p_connection_id, content = v_content,
        message_type = p_message_type, media_url = p_media_url, sender = 'contact',
        status = v_status
    WHERE id = v_existing.id;
    v_message_id := v_existing.id;
    v_outcome := 'updated';
  ELSE
    INSERT INTO public.messages (contact_id, whatsapp_connection_id, content, message_type, media_url, sender, external_id, status, created_at)
    VALUES (v_contact.id, p_connection_id, p_content, p_message_type, p_media_url, 'contact', p_external_id, 'received', p_created_at)
    ON CONFLICT (whatsapp_connection_id, external_id, sender) DO NOTHING
    RETURNING id INTO v_message_id;
    v_outcome := CASE WHEN v_message_id IS NULL THEN 'duplicate' ELSE 'inserted' END;

    -- R2-API-006: no 'duplicate' o id da linha vencedora registra os efeitos.
    IF v_outcome = 'duplicate' THEN
      SELECT m.id INTO v_message_id
      FROM public.messages m
      WHERE m.whatsapp_connection_id = p_connection_id AND m.sender = 'contact' AND m.external_id = p_external_id
      ORDER BY m.created_at DESC
      LIMIT 1;
    END IF;
  END IF;

  -- R2-API-006 + #190: efeitos pendentes na mesma transacao do ingest. NOT
  -- p_from_me e o antigo `if (!key.fromMe)` preservado no enfileiramento.
  -- 'indeterminate' vira resolucao pendente (texto e citacao no payload para a
  -- drenagem decidir e liberar): NUNCA atribuicao, NUNCA supressao otimista.
  IF v_message_id IS NOT NULL AND NOT p_from_me THEN
    IF p_opt_out_decision = 'matched' THEN
      INSERT INTO public.inbound_message_effects (whatsapp_connection_id, external_id, effect, payload)
      VALUES (p_connection_id, p_external_id, 'optout_suppress',
              jsonb_build_object('contact_id', v_contact.id, 'phone', p_phone,
                                 'keyword', p_opt_out_keyword, 'message_id', v_message_id))
      ON CONFLICT (whatsapp_connection_id, external_id, effect) DO NOTHING;
    ELSIF p_opt_out_decision = 'indeterminate' THEN
      INSERT INTO public.inbound_message_effects (whatsapp_connection_id, external_id, effect, payload)
      VALUES (p_connection_id, p_external_id, 'optout_resolve',
              jsonb_build_object('contact_id', v_contact.id, 'phone', p_phone,
                                 'message_id', v_message_id, 'text', p_content,
                                 'quoted_external_id', p_quoted_external_id))
      ON CONFLICT (whatsapp_connection_id, external_id, effect) DO NOTHING;
    ELSE
      INSERT INTO public.inbound_message_effects (whatsapp_connection_id, external_id, effect, payload)
      VALUES (p_connection_id, p_external_id, 'talkx_reply',
              jsonb_build_object('contact_id', v_contact.id, 'phone', p_phone, 'message_id', v_message_id))
      ON CONFLICT (whatsapp_connection_id, external_id, effect) DO NOTHING;
      INSERT INTO public.inbound_message_effects (whatsapp_connection_id, external_id, effect, payload)
      VALUES (p_connection_id, p_external_id, 'multiplix_reply',
              jsonb_build_object('phone', p_phone, 'message_id', v_message_id,
                                 'quoted_external_id', p_quoted_external_id))
      ON CONFLICT (whatsapp_connection_id, external_id, effect) DO NOTHING;
    END IF;
  END IF;

  RETURN QUERY SELECT v_contact.id, v_contact.name, v_contact.assigned_to, v_contact.avatar_url, v_created, v_message_id, v_outcome;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz, boolean, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz, boolean, text, text, text) TO service_role;

COMMENT ON FUNCTION public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz, boolean, text, text, text) IS 'Transacao atomica do inbound: contato + upsert da mensagem + efeitos pendentes em inbound_message_effects (R2-API-006). #190: p_opt_out_decision (matched|not_matched|indeterminate|NULL=nao avaliado) e OBRIGATORIO; indeterminate enfileira optout_resolve — resolucao pendente, nunca atribuicao. p_from_me=true nao cria efeito. outcome = inserted | updated | duplicate. So service_role.';

CREATE OR REPLACE FUNCTION public.drain_inbound_message_effects(
  p_connection_id uuid,
  p_external_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_row record;
  v_message_id uuid;
  v_content text;
  v_keyword text;
  v_suppression_id uuid;
  v_optout_status text;
  v_talkx jsonb;
  v_multiplix jsonb;
  v_failed integer := 0;
  v_phone_digits text;
  v_reply_message_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_connection_id IS NULL OR coalesce(p_external_id, '') = '' THEN
    RAISE EXCEPTION 'invalid_inbound_effects_key' USING ERRCODE = '22023';
  END IF;

  SELECT m.id, m.content INTO v_message_id, v_content
  FROM public.messages m
  WHERE m.whatsapp_connection_id = p_connection_id AND m.sender = 'contact' AND m.external_id = p_external_id
  ORDER BY m.created_at DESC
  LIMIT 1;

  FOR v_row IN
    SELECT e.id, e.effect, e.payload FROM public.inbound_message_effects e
     WHERE e.whatsapp_connection_id = p_connection_id
       AND e.external_id = p_external_id
       AND e.applied_at IS NULL
     ORDER BY e.created_at, e.id
     FOR UPDATE OF e
  LOOP
    UPDATE public.inbound_message_effects SET attempts = attempts + 1 WHERE id = v_row.id;
    BEGIN
      CASE v_row.effect
        WHEN 'optout_suppress' THEN
          v_phone_digits := regexp_replace(coalesce(v_row.payload ->> 'phone', ''), '\D', '', 'g');
          IF length(v_phone_digits) < 8 THEN
            v_optout_status := 'invalid_phone';
          ELSIF EXISTS (
            SELECT 1 FROM public.talkx_recipients r
             WHERE r.contact_id = (v_row.payload ->> 'contact_id')::uuid
               AND r.sent_at IS NOT NULL
               AND r.sent_at >= statement_timestamp() - interval '30 days'
          ) THEN
            -- Mesmo contrato da edge: a campanha NAO e resolvida aqui — a RPC
            -- herda a do envio mais recente (origem auto_optout).
            v_suppression_id := public.talkx_suppress_contact(
              (v_row.payload ->> 'contact_id')::uuid, v_row.payload ->> 'phone',
              'Opt-out via mensagem: ' || (v_row.payload ->> 'keyword'), 'opt_out', 'auto_optout',
              coalesce((v_row.payload ->> 'message_id')::uuid, v_message_id));
            v_optout_status := CASE WHEN v_suppression_id IS NOT NULL THEN 'suppressed' ELSE 'already_suppressed' END;
          ELSE
            v_optout_status := 'no_recent_send';
          END IF;
        WHEN 'optout_resolve' THEN
          -- #190: reavalia pela fonte autoritativa (talkx_match_optout le
          -- talkx_optout_keywords). Excecao = ainda indeterminado: o EXCEPTION
          -- do laco registra last_error e conserva a pendencia; NULL devolvido
          -- pela RPC e decisao legitima de "nao casou".
          v_keyword := public.talkx_match_optout(coalesce(v_row.payload ->> 'text', v_content));
          IF v_keyword IS NOT NULL THEN
            v_phone_digits := regexp_replace(coalesce(v_row.payload ->> 'phone', ''), '\D', '', 'g');
            IF length(v_phone_digits) < 8 THEN
              v_optout_status := 'invalid_phone';
            ELSIF EXISTS (
              SELECT 1 FROM public.talkx_recipients r
               WHERE r.contact_id = (v_row.payload ->> 'contact_id')::uuid
                 AND r.sent_at IS NOT NULL
                 AND r.sent_at >= statement_timestamp() - interval '30 days'
            ) THEN
              v_suppression_id := public.talkx_suppress_contact(
                (v_row.payload ->> 'contact_id')::uuid, v_row.payload ->> 'phone',
                'Opt-out via mensagem: ' || v_keyword, 'opt_out', 'auto_optout',
                coalesce((v_row.payload ->> 'message_id')::uuid, v_message_id));
              v_optout_status := CASE WHEN v_suppression_id IS NOT NULL THEN 'suppressed' ELSE 'already_suppressed' END;
            ELSE
              v_optout_status := 'no_recent_send';
            END IF;
          ELSE
            -- Decidido "nao casou": libera as atribuicoes aplicaveis UMA vez,
            -- na mesma transacao da baixa (a citacao veio no payload).
            v_reply_message_id := coalesce((v_row.payload ->> 'message_id')::uuid, v_message_id);
            IF v_reply_message_id IS NULL THEN
              v_talkx := jsonb_build_object('attributed', false, 'attribution', null, 'reason', 'message_missing');
            ELSE
              v_talkx := public.attribute_talkx_reply(
                (v_row.payload ->> 'contact_id')::uuid, v_row.payload ->> 'phone', v_reply_message_id);
            END IF;
            v_multiplix := public.attribute_multiplix_item_reply(
              v_row.payload ->> 'phone',
              coalesce(v_row.payload ->> 'message_id', v_message_id::text),
              v_row.payload ->> 'quoted_external_id');
          END IF;
        WHEN 'talkx_reply' THEN
          v_reply_message_id := coalesce((v_row.payload ->> 'message_id')::uuid, v_message_id);
          IF v_reply_message_id IS NULL THEN
            v_talkx := jsonb_build_object('attributed', false, 'attribution', null, 'reason', 'message_missing');
          ELSE
            v_talkx := public.attribute_talkx_reply(
              (v_row.payload ->> 'contact_id')::uuid, v_row.payload ->> 'phone', v_reply_message_id);
          END IF;
        WHEN 'multiplix_reply' THEN
          v_multiplix := public.attribute_multiplix_item_reply(
            v_row.payload ->> 'phone',
            coalesce(v_row.payload ->> 'message_id', v_message_id::text),
            v_row.payload ->> 'quoted_external_id');
        ELSE
          RAISE EXCEPTION 'invalid_inbound_effect: %', v_row.effect USING ERRCODE = '22023';
      END CASE;
      UPDATE public.inbound_message_effects
         SET applied_at = statement_timestamp(), last_error = NULL
       WHERE id = v_row.id;
    EXCEPTION WHEN OTHERS THEN
      -- Efeito e baixa desfazem juntos; tentativa e motivo ficam na linha
      -- pendente para a proxima entrega.
      v_failed := v_failed + 1;
      UPDATE public.inbound_message_effects SET last_error = SQLERRM WHERE id = v_row.id;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'suppression_id', v_suppression_id,
    'optout_status', v_optout_status,
    'talkx_reply', v_talkx,
    'multiplix_reply', v_multiplix,
    'pending_failed', v_failed
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.drain_inbound_message_effects(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.drain_inbound_message_effects(uuid, text) TO service_role;

COMMENT ON FUNCTION public.drain_inbound_message_effects(uuid, text) IS 'R2-API-006 + #190: aplica e baixa cada pendencia da outbox na mesma transacao; falha fica em last_error e a reentrega retenta. optout_resolve e reavaliado via talkx_match_optout: casou = so supressao, nao casou = libera atribuicoes uma vez, excecao = pendencia conservada. Retorna suppression_id novo (autoresposta 1x), optout_status e atribuicoes. So service_role.';
