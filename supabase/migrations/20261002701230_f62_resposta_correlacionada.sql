-- rollback: DROP FUNCTION IF EXISTS public.attribute_multiplix_item_reply(text, text, text);
--
-- F62 · Multiplix — correlaciona a RESPOSTA do contato ao item que a originou.
--
-- O que ja existia (e nao se duplica aqui):
--   * sent/delivered/read: `multiplix_delivery_items` ja recebe os tres via
--     `record_multiplix_item_delivered` (F32b) com `p_event='read'` elevando para read_at (F58);
--   * TalkX: `_shared/talkx-reply.ts` correlaciona a resposta em `talkx_recipients`.
-- O que FALTAVA e o que esta funcao faz: o ITEM do Multiplix nao tinha quem marcasse
-- `replied_at` / `reply_attribution` — o monitor mostrava enviado/entregue/lido e nunca
-- "respondido".
--
-- POR QUE A CHAVE E O TELEFONE, E NAO `contact_id`:
-- `multiplix_recipients` NAO tem `contact_id`. O destinatario guarda `destino_e164` (o
-- telefone) e `company_id` (a empresa). Entao o vinculo "esta resposta veio de quem
-- recebeu" e por TELEFONE. A comparacao normaliza os dois lados (`\D` fora) porque o
-- `destino_e164` pode vir com '+', espacos ou parenteses, e o webhook entrega o JID ja
-- limpo — comparar cru daria "nao casou" em metade dos casos e a atribuicao sumiria em
-- silencio. O sufixo de 8 digitos cobre a variacao do 9 de celular entre origens.
--
-- Duas atribuicoes, e a distincao e o ponto da flag:
--   * `linked`   — a resposta CITOU uma mensagem nossa, e o `external_id` citado casa com o
--                  `external_id` de um item. A correlacao e EXATA: sabemos qual envio gerou
--                  a resposta. E o caso bom.
--   * `inferred` — nao houve citacao (ou a citacao nao casou). Atribuimos por JANELA +
--                  TELEFONE: o item mais recente daquele numero que ainda esta dentro de
--                  `reply_window_hours`. E o melhor palpite, e por isso NAO pode ser
--                  apresentado como certeza — a flag existe exatamente para o operador
--                  (e o relatorio) saberem a diferenca.
--
-- Por que a janela vem de `talkx_settings.reply_window_hours` e nao de um literal: a
-- atribuicao do TalkX usa essa mesma chave (V18, com cache de 5 min no edge). Duas janelas
-- diferentes para o mesmo conceito fariam o mesmo contato contar como resposta em um canal
-- e nao no outro. Default 72h, igual ao `DEFAULT_REPLY_WINDOW_HOURS` do talkx-reply.ts.
--
-- Idempotencia: o UPDATE so age em item com `replied_at IS NULL`. Reentrega de webhook
-- (at-least-once) nao reescreve a atribuicao nem rebaixa `linked` para `inferred` — o
-- primeiro a chegar vence, e ele e o mais confiavel (a citacao chega junto da mensagem).
--
-- Ortogonalidade: `replied_at` NAO muda `status`. Um item pode estar `delivered` e
-- respondido; a resposta nao promove para `read` (o provedor pode nunca mandar o recibo) e
-- tambem nao o rebaixa. Os contadores do dispatch contam respondidos pelo indice parcial
-- `idx_multiplix_delivery_items_dispatch_replied` (criado na f51).

CREATE OR REPLACE FUNCTION public.attribute_multiplix_item_reply(
  p_phone              text,
  p_message_id         text,
  p_quoted_external_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_message_id text := NULLIF(btrim(COALESCE(p_message_id, '')), '');
  v_quoted     text := NULLIF(btrim(COALESCE(p_quoted_external_id, '')), '');
  v_digits     text;
  v_tail       text;
  v_window     numeric;
  v_cutoff     timestamptz;
  v_item_id    uuid;
  v_attribution text;
  v_dispatch   uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF v_message_id IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_reply' USING ERRCODE = '22023';
  END IF;
  IF length(v_message_id) > 512 OR (v_quoted IS NOT NULL AND length(v_quoted) > 512) THEN
    RAISE EXCEPTION 'invalid_multiplix_reply' USING ERRCODE = '22023';
  END IF;

  -- Normaliza o telefone do chamador uma unica vez; sem digitos suficientes nao da
  -- para correlacionar com seguranca (devolve "nao atribuido" em vez de chutar).
  v_digits := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  IF length(v_digits) < 8 THEN
    RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'invalid_phone');
  END IF;
  v_tail := right(v_digits, 8);

  -- `value` e jsonb: `#>> '{}'` extrai o escalar como texto antes do cast. Escrever
  -- NULLIF(value,'') direto quebra em runtime (jsonb vs text), nao em tempo de criacao.
  SELECT COALESCE(NULLIF(value #>> '{}', '')::numeric, 72) INTO v_window
    FROM public.talkx_settings WHERE key = 'reply_window_hours' LIMIT 1;
  IF v_window IS NULL OR v_window <= 0 THEN
    v_window := 72;
  END IF;
  v_cutoff := statement_timestamp() - make_interval(hours => v_window::int);

  -- (1) `linked`: a resposta citou uma mensagem nossa e o external_id casou. Correlacao exata.
  IF v_quoted IS NOT NULL THEN
    SELECT item.id, item.dispatch_id
      INTO v_item_id, v_dispatch
      FROM public.multiplix_delivery_items AS item
     WHERE item.external_id = v_quoted
       AND item.replied_at IS NULL
       AND item.sent_at IS NOT NULL
       AND item.sent_at >= v_cutoff
     ORDER BY item.sent_at DESC
     LIMIT 1;
    IF v_item_id IS NOT NULL THEN
      v_attribution := 'linked';
    END IF;
  END IF;

  -- (2) `inferred`: sem citacao utilizavel, atribui pelo item mais recente daquele TELEFONE
  -- na janela. O casamento por sufixo de 8 digitos e o que impede atribuir a resposta de um
  -- numero ao envio de OUTRO (o modo de falha que a flag `inferred` denuncia).
  IF v_item_id IS NULL THEN
    SELECT item.id, item.dispatch_id
      INTO v_item_id, v_dispatch
      FROM public.multiplix_delivery_items AS item
      JOIN public.multiplix_recipients AS recipient ON recipient.id = item.recipient_id
     WHERE right(regexp_replace(COALESCE(recipient.destino_e164, ''), '\D', '', 'g'), 8) = v_tail
       AND item.replied_at IS NULL
       AND item.sent_at IS NOT NULL
       AND item.sent_at >= v_cutoff
     ORDER BY item.sent_at DESC
     LIMIT 1;
    IF v_item_id IS NOT NULL THEN
      v_attribution := 'inferred';
    END IF;
  END IF;

  IF v_item_id IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'no_item_in_window');
  END IF;

  UPDATE public.multiplix_delivery_items
     SET replied_at         = statement_timestamp(),
         reply_attribution  = v_attribution,
         updated_at         = statement_timestamp()
   WHERE id = v_item_id
     AND replied_at IS NULL;

  RETURN jsonb_build_object(
    'attributed', true,
    'attribution', v_attribution,
    'item_id', v_item_id,
    'dispatch_id', v_dispatch
  );
END;
$function$;

COMMENT ON FUNCTION public.attribute_multiplix_item_reply(text, text, text) IS
  'F62: correlaciona a resposta do contato ao item pelo TELEFONE (multiplix_recipients nao tem contact_id). linked = external_id citado casou; inferred = janela + telefone. Nao altera status; idempotente por replied_at IS NULL.';

REVOKE ALL ON FUNCTION public.attribute_multiplix_item_reply(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_multiplix_item_reply(text, text, text) TO service_role;
