-- rollback: DROP FUNCTION IF EXISTS public.attribute_multiplix_item_reply(text, text, text);
--
-- F62b · CORRECAO — `attribute_multiplix_item_reply` quebrava em runtime.
--
-- O que estava errado na `20261002701230_f62_resposta_correlacionada.sql` (v1, ja aplicada
-- e IMUTAVEL — este arquivo e a substituta, no mesmo padrao da f51c):
--
--   SELECT COALESCE(NULLIF(value, '')::numeric, 72) INTO v_window FROM public.talkx_settings ...
--
-- `talkx_settings.value` e **jsonb** (nao text). `NULLIF(jsonb, '')` nao existe em Postgres
-- e a funcao criava sem reclamar — o erro so aparecia na PRIMEIRA CHAMADA:
--   PL/pgSQL function attribute_multiplix_item_reply(text,text,text) line 31 at SQL statement
-- Ou seja: a v1 passou em qualquer `deno check`, em qualquer revisao de texto e no proprio
-- `CREATE FUNCTION`, e falharia em producao no primeiro contato que respondesse. O sintoma
-- chegou a ser mascarado no harness porque a saida do `psql` vai para stderr e o teste
-- comparava stdout vazio — foi preciso ler o trace, nao o exit code, para ver o motivo real.
--
-- Correcao: `value #>> '{}'` extrai o escalar jsonb como texto antes do cast, que e a forma
-- canonica de ler um escalar jsonb no Postgres. O restante da funcao e identico a v1
-- (o corpo foi relido linha a linha contra a v1 para nao introduzir mudanca de comportamento
-- de carona na correcao).
--
-- `CREATE OR REPLACE` mantem a assinatura `(text, text, text)`, entao quem ja chama a v1
-- (o edge `_shared/talkx-reply.ts`, via `attributeMultiplixReply`) passa a usar a versao
-- corrigida sem nenhuma troca de nome ou de argumentos. ACL e comentario sao reafirmados.

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
  'F62b: correlaciona a resposta do contato ao item pelo TELEFONE (multiplix_recipients nao tem contact_id). linked = external_id citado casou; inferred = janela + telefone. Nao altera status; idempotente por replied_at IS NULL. Substitui a v1 (20261002701230), que lia talkx_settings.value como texto e quebrava na 1a chamada.';

REVOKE ALL ON FUNCTION public.attribute_multiplix_item_reply(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_multiplix_item_reply(text, text, text) TO service_role;
