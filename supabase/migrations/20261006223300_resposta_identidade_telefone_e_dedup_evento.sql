-- resposta_identidade_telefone_e_dedup_evento
-- Rollback: bloco SQL executavel no FIM deste arquivo, entre as linhas '-- >>> ROLLBACK-BEGIN' e '-- <<< ROLLBACK-END' (o sed que extrai esta no comentario do cabecalho). Desfaz: a tabela de eventos, o helper phone_identity e os dois CORPOS ANTERIORES das funcoes, com as ACLs.
-- versao 20261006223300 reservada para hermes-t-54415556-2610061930b2f6 em 2026-10-06T22:33:00Z (hermes-db-migrar --nova)
-- R2-DB-002 (item 292, P2) - banco - CONTRATO (CREATE TABLE + CREATE OR REPLACE FUNCTION + ACL).
--
-- DEFEITO (auditoria de 2026-10-03, findings/database R2-DB-002):
--   public.attribute_talkx_reply (20261003212707:335-421) e
--   public.attribute_multiplix_item_reply (20261003092707:27-128) identificavam o
--   REMETENTE da resposta pelo SUFIXO DE 8 DIGITOS do telefone, num OR sem prioridade, e
--   escolhiam o envio mais recente. Dois numeros com DDD/pais diferentes que terminam nos
--   mesmos 8 digitos COLIDEM: a resposta fecha a campanha de OUTRA pessoa. E o
--   identificador do evento recebido (p_message_id) era gravado mas nao impedia uma segunda
--   atribuicao do MESMO evento — no reprocessamento o destinatario ja marcado sai do filtro
--   `replied_at IS NULL` e OUTRO destinatario e fechado.
--
-- O QUE MUDA (as duas assinaturas sao PRESERVADAS: nenhum chamador de edge muda de nome de
-- RPC nem de argumento; nenhuma coluna de contrato publico e alterada):
--   1. public.phone_identity(text) — identidade canonica do remetente: digitos, DDI 55
--      removido, DDD (2) + 8 digitos e 9o digito do celular normalizado (mesma convencao do
--      public.phone_variants, 20260905050000). Sem DDD nao existe identidade (NULL) e a
--      atribuicao RECUSA em vez de chutar por sufixo.
--   2. attribute_talkx_reply: o contato exato tem PRECEDENCIA (eixo proprio, avaliado
--      antes); o eixo por telefone passa a exigir identidade IGUAL e a MESMA CONEXAO que
--      recebeu a resposta (compare com talkx_campaigns.whatsapp_connection_id).
--   3. attribute_multiplix_item_reply: idem para multiplix_recipients.destino_e164 e
--      multiplix_dispatches.whatsapp_connection_id. A citacao exata (linked) continua
--      resolvendo por external_id, como antes.
--   4. public.reply_attribution_events (PK (channel, event_id)): o evento recebido passa a
--      ser PERSISTIDO e RESTRITO por chave primaria — cardinalidade decidida pelo produto:
--      um evento = no maximo UMA atribuicao por canal. O INSERT ... ON CONFLICT DO NOTHING
--      e a trava (vale para retry e para chamadas concorrentes). Evento repetido devolve
--      attributed=false / reason=duplicate_event e NAO fecha um segundo destinatario.
--   5. As duas funcoes so devolvem attributed=true quando o UPDATE realmente gravou
--      (RETURNING): perder a linha para outra transacao devolve false, nunca true.
--
-- DECISAO DE PRODUTO (delimitar a identidade). A conexao/instancia e aplicada ao eixo por
-- TELEFONE, que e o unico que ADIVINHA quem respondeu. Os eixos EXATOS (contact_id do
-- contato no Talk X e citacao por external_id no Multiplix) ja sao identidade forte e nao
-- sao restringidos: restringi-los recusaria atribuicao legitima depois do relink de conexao
-- que o proprio public.ingest_inbound_message faz (grava no contato a conexao que recebeu a
-- mensagem). A conexao e deduzida do PROPRIO evento — public.messages.whatsapp_connection_id
-- da mensagem recebida, que o webhook acabou de inserir e cujo id e o p_message_id das duas
-- RPCs. Nenhuma das duas RPCs recebe conexao como argumento e mudar a assinatura criaria um
-- overload novo (nasceria com EXECUTE para PUBLIC) e quebraria os chamadores.
--
-- DADO LEGADO: esta migration NAO altera nenhuma linha existente (sem ADD CONSTRAINT e sem
-- backfill sobre dado antigo); a tabela de eventos nasce vazia. Atribuicoes antigas com o
-- mesmo reply_message_id permanecem como estao — nao ha como reconstruir qual delas era a
-- correta, e o rollback nao devolve os eventos ja consumidos.
--
-- Classe: CONTRATO. Idempotente/replayavel. Nenhum retrato (schema-*.json, types.ts) e
-- regenerado aqui. Marker interno que o harness usa para achar a migration:
-- resposta_identidade_dedup_objetos
--
-- Rollback (mesmo comando do cabecalho):
--   sed -n '/^-- >>> ROLLBACK-BEGIN$/,/^-- <<< ROLLBACK-END$/p' <este arquivo> | sed '1d;$d' | sed -E 's/^-- ?//'

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Identidade canonica do remetente (helper novo, service_role).
--    NUNCA usar o sufixo de 8 digitos como identidade: ele e global e reune numeros de
--    DDD/pais diferentes. Sem DDD a funcao devolve NULL e quem chama recusa a atribuicao.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.phone_identity(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_digits text := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  v_ddd    text;
  v_rest   text;
BEGIN
  IF v_digits = '' THEN
    RETURN NULL;
  END IF;

  -- DDI do Brasil: um numero com 12+ digitos que comeca em 55 perde o DDI (mesma leitura
  -- do public.phone_variants).
  IF left(v_digits, 2) = '55' AND length(v_digits) >= 12 THEN
    v_digits := substr(v_digits, 3);
  END IF;

  -- Sem DDD nao existe identidade: devolver NULL e o que faz a atribuicao recusar em vez
  -- de casar pelo rabo do numero (o defeito R2-DB-002).
  IF length(v_digits) < 10 THEN
    RETURN NULL;
  END IF;
  v_ddd  := left(v_digits, 2);
  v_rest := substr(v_digits, 3);

  -- 9o digito do celular normalizado (a mesma convencao do phone_variants).
  IF length(v_rest) = 9 AND left(v_rest, 1) = '9' THEN
    v_rest := substr(v_rest, 2);
  END IF;

  IF length(v_rest) <> 8 THEN
    RETURN NULL;
  END IF;

  RETURN v_ddd || v_rest;
END;
$function$;

REVOKE ALL ON FUNCTION public.phone_identity(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phone_identity(text) TO service_role;

COMMENT ON FUNCTION public.phone_identity(text) IS
  'R2-DB-002: identidade canonica do remetente = DDD (2) + 8 digitos, com DDI 55 removido e 9o digito do celular normalizado. NULL quando nao ha DDD (nao se identifica por sufixo de 8 digitos). service_role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Evento recebido persistido e RESTRITO por chave primaria.
--    Tabela nova nasce fechada: RLS ligada (sem policy = ninguem acessa pelo cliente) e
--    REVOKE de PUBLIC/anon/authenticated. Quem escreve e a funcao SECURITY DEFINER (dona
--    da tabela), nunca o cliente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reply_attribution_events (
  channel       text NOT NULL,
  event_id      text NOT NULL,
  recipient_ref uuid NOT NULL,
  attributed_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT reply_attribution_events_pkey PRIMARY KEY (channel, event_id),
  CONSTRAINT reply_attribution_events_channel_check CHECK (channel IN ('talkx', 'multiplix')),
  CONSTRAINT reply_attribution_events_event_id_check CHECK (length(event_id) BETWEEN 1 AND 512)
);

ALTER TABLE public.reply_attribution_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.reply_attribution_events FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.reply_attribution_events IS
  'R2-DB-002: chave do EVENTO de resposta consumida. PK (channel, event_id) = um evento atribui no maximo UMA vez por canal (retry/reprocessamento/corrida nao fecham um segundo destinatario). recipient_ref aponta para talkx_recipients.id (channel=talkx) ou multiplix_delivery_items.id (channel=multiplix) — sem FK por ter dois alvos.';
COMMENT ON COLUMN public.reply_attribution_events.recipient_ref IS
  'Destinatario/item que consumiu o evento. Sem FK: o alvo depende do channel.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) attribute_talkx_reply — contato exato com PRECEDENCIA; telefone por identidade
--    canonica + conexao do evento; evento consumido uma unica vez.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.attribute_talkx_reply(
  p_contact_id uuid,
  p_phone      text,
  p_message_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_identity     text;
  v_connection   uuid;
  v_window       numeric;
  v_cutoff       timestamptz;
  v_recipient_id uuid;
  v_campaign_id  uuid;
  v_contact_id   uuid;
  v_attribution  text;
  v_event_ref    uuid;
  v_updated      uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_reply' USING ERRCODE = '22023';
  END IF;

  -- Identidade canonica do remetente (DDD + 8 digitos). NULL = nao da para saber QUEM
  -- respondeu: sem identidade nao ha atribuicao por telefone (nada de chutar por sufixo).
  v_identity := public.phone_identity(p_phone);

  -- Conexao que RECEBEU a resposta, lida do proprio evento. O webhook so chama esta RPC
  -- depois de gravar a mensagem (tx.outcome='inserted'), entao public.messages tem a linha.
  SELECT message.whatsapp_connection_id INTO v_connection
    FROM public.messages AS message
   WHERE message.id = p_message_id;

  IF p_contact_id IS NULL AND v_identity IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'no_subject');
  END IF;

  -- reply_window_hours e jsonb; `#>> '{}'` extrai o escalar como TEXTO antes do cast
  -- (NULLIF(jsonb, '') nao existe — quebra em runtime, nao na criacao).
  SELECT COALESCE(NULLIF(value #>> '{}', '')::numeric, 72) INTO v_window
    FROM public.talkx_settings WHERE key = 'reply_window_hours' LIMIT 1;
  IF v_window IS NULL OR v_window <= 0 THEN
    v_window := 72;
  END IF;
  v_cutoff := statement_timestamp() - make_interval(hours => v_window::int);

  -- (1) PRECEDENCIA: contato exato (identidade forte, nao depende de telefone).
  IF p_contact_id IS NOT NULL THEN
    SELECT recipient.id, recipient.campaign_id, recipient.contact_id
      INTO v_recipient_id, v_campaign_id, v_contact_id
      FROM public.talkx_recipients AS recipient
     WHERE recipient.replied_at IS NULL
       AND recipient.sent_at IS NOT NULL
       AND recipient.sent_at >= v_cutoff
       AND recipient.contact_id = p_contact_id
     ORDER BY recipient.sent_at DESC, recipient.id DESC
     LIMIT 1
     FOR UPDATE OF recipient;
    IF v_recipient_id IS NOT NULL THEN
      v_attribution := 'contact';
    END IF;
  END IF;

  -- (2) Telefone: identidade canonica IGUAL (DDD incluido) na MESMA conexao que recebeu a
  -- resposta. DDD diferente com o mesmo final NAO casa; conexao diferente NAO casa.
  IF v_recipient_id IS NULL AND v_identity IS NOT NULL THEN
    SELECT recipient.id, recipient.campaign_id, recipient.contact_id
      INTO v_recipient_id, v_campaign_id, v_contact_id
      FROM public.talkx_recipients AS recipient
      JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
      JOIN public.contacts AS contact ON contact.id = recipient.contact_id
     WHERE recipient.replied_at IS NULL
       AND recipient.sent_at IS NOT NULL
       AND recipient.sent_at >= v_cutoff
       AND public.phone_identity(contact.phone) = v_identity
       AND (v_connection IS NOT NULL AND campaign.whatsapp_connection_id = v_connection)
     ORDER BY recipient.sent_at DESC, recipient.id DESC
     LIMIT 1
     FOR UPDATE OF recipient;
    IF v_recipient_id IS NOT NULL THEN
      v_attribution := 'phone';
    END IF;
  END IF;

  IF v_recipient_id IS NULL THEN
    RETURN jsonb_build_object(
      'attributed', false,
      'attribution', NULL,
      'reason',
      CASE
        WHEN v_identity IS NULL AND p_contact_id IS NULL THEN 'no_subject'
        WHEN v_connection IS NULL THEN 'connection_unknown'
        ELSE 'no_recipient_in_window'
      END
    );
  END IF;

  -- (3) Consome o EVENTO recebido. A PK (channel, event_id) e a trava: o mesmo evento
  -- (retry, reprocessamento, corrida) atribui UMA unica vez.
  INSERT INTO public.reply_attribution_events (channel, event_id, recipient_ref)
  VALUES ('talkx', p_message_id::text, v_recipient_id)
  ON CONFLICT (channel, event_id) DO NOTHING
  RETURNING recipient_ref INTO v_event_ref;

  IF v_event_ref IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'duplicate_event');
  END IF;

  -- (4) attributed=true SO se o UPDATE realmente gravou.
  UPDATE public.talkx_recipients
     SET replied_at = statement_timestamp(),
         reply_message_id = p_message_id,
         updated_at = statement_timestamp()
   WHERE id = v_recipient_id
     AND replied_at IS NULL
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'not_updated');
  END IF;

  RETURN jsonb_build_object(
    'attributed', true,
    'attribution', v_attribution,
    'recipient_id', v_recipient_id,
    'campaign_id', v_campaign_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.attribute_talkx_reply(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_talkx_reply(uuid, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.attribute_talkx_reply(uuid, text, uuid) IS
  'R2-DB-002: contato exato tem PRECEDENCIA; o eixo por telefone exige identidade canonica (DDD + 8 digitos, 9o digito normalizado) e a MESMA conexao que recebeu a resposta; o evento (p_message_id) e consumido UMA vez em reply_attribution_events. attributed=true so quando o UPDATE gravou. SECURITY DEFINER, service_role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) attribute_multiplix_item_reply — citacao exata (linked); telefone por identidade
--    canonica + conexao do dispatch; evento consumido uma unica vez.
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_message_id  text := NULLIF(btrim(COALESCE(p_message_id, '')), '');
  v_quoted      text := NULLIF(btrim(COALESCE(p_quoted_external_id, '')), '');
  v_identity    text;
  v_connection  uuid;
  v_window      numeric;
  v_cutoff      timestamptz;
  v_item_id     uuid;
  v_dispatch    uuid;
  v_attribution text;
  v_event_ref   text;
  v_updated     uuid;
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

  -- Identidade canonica do remetente (DDD + 8 digitos); NULL = nao da para saber quem
  -- respondeu (o sufixo de 8 digitos nao vale como identidade).
  v_identity := public.phone_identity(p_phone);

  -- Conexao que recebeu a resposta: o p_message_id do Multiplix tambem e o id da mensagem
  -- recebida em public.messages (mesmo p_message_id que o edge passa ao Talk X). O id vem
  -- como texto e o formato e conferido ANTES do cast: id fora do formato de uuid nao vira
  -- erro de cast, vira ausencia de conexao (fail-closed).
  IF v_message_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    SELECT message.whatsapp_connection_id INTO v_connection
      FROM public.messages AS message
     WHERE message.id = v_message_id::uuid;
  END IF;

  -- `value` e jsonb: `#>> '{}'` extrai o escalar como texto antes do cast. Escrever
  -- NULLIF(value,'') direto quebra em runtime (jsonb vs text), nao em tempo de criacao.
  SELECT COALESCE(NULLIF(value #>> '{}', '')::numeric, 72) INTO v_window
    FROM public.talkx_settings WHERE key = 'reply_window_hours' LIMIT 1;
  IF v_window IS NULL OR v_window <= 0 THEN
    v_window := 72;
  END IF;
  v_cutoff := statement_timestamp() - make_interval(hours => v_window::int);

  -- (1) `linked`: a resposta citou uma mensagem nossa e o external_id casou. Correlacao
  -- exata — nao depende de telefone nem de conexao (a citacao E a identidade).
  IF v_quoted IS NOT NULL THEN
    SELECT item.id, item.dispatch_id
      INTO v_item_id, v_dispatch
      FROM public.multiplix_delivery_items AS item
     WHERE item.external_id = v_quoted
       AND item.replied_at IS NULL
       AND item.sent_at IS NOT NULL
       AND item.sent_at >= v_cutoff
     ORDER BY item.sent_at DESC
     LIMIT 1
     FOR UPDATE OF item;
    IF v_item_id IS NOT NULL THEN
      v_attribution := 'linked';
    END IF;
  END IF;

  -- (2) `inferred`: sem citacao utilizavel, casa pela IDENTIDADE canonica do destino na
  -- MESMA conexao do dispatch. Sufixo de 8 digitos global (o defeito) nao e usado.
  IF v_item_id IS NULL AND v_identity IS NOT NULL THEN
    SELECT item.id, item.dispatch_id
      INTO v_item_id, v_dispatch
      FROM public.multiplix_delivery_items AS item
      JOIN public.multiplix_recipients AS recipient ON recipient.id = item.recipient_id
      JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = item.dispatch_id
     WHERE public.phone_identity(recipient.destino_e164) = v_identity
       AND item.replied_at IS NULL
       AND item.sent_at IS NOT NULL
       AND item.sent_at >= v_cutoff
       AND (v_connection IS NOT NULL AND dispatch.whatsapp_connection_id = v_connection)
     ORDER BY item.sent_at DESC
     LIMIT 1
     FOR UPDATE OF item;
    IF v_item_id IS NOT NULL THEN
      v_attribution := 'inferred';
    END IF;
  END IF;

  IF v_item_id IS NULL THEN
    RETURN jsonb_build_object(
      'attributed', false,
      'attribution', NULL,
      'reason',
      CASE
        WHEN v_identity IS NULL AND v_quoted IS NULL THEN 'phone_identity_unknown'
        WHEN v_quoted IS NULL AND v_connection IS NULL THEN 'connection_unknown'
        ELSE 'no_item_in_window'
      END
    );
  END IF;

  -- (3) Consome o EVENTO recebido (ver Talk X): o mesmo evento atribui UMA unica vez.
  INSERT INTO public.reply_attribution_events (channel, event_id, recipient_ref)
  VALUES ('multiplix', v_message_id, v_item_id)
  ON CONFLICT (channel, event_id) DO NOTHING
  RETURNING event_id INTO v_event_ref;

  IF v_event_ref IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'duplicate_event');
  END IF;

  -- (4) attributed=true SO se o UPDATE realmente gravou.
  UPDATE public.multiplix_delivery_items
     SET replied_at         = statement_timestamp(),
         reply_attribution  = v_attribution,
         updated_at         = statement_timestamp()
   WHERE id = v_item_id
     AND replied_at IS NULL
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'not_updated');
  END IF;

  RETURN jsonb_build_object(
    'attributed', true,
    'attribution', v_attribution,
    'item_id', v_item_id,
    'dispatch_id', v_dispatch
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.attribute_multiplix_item_reply(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_multiplix_item_reply(text, text, text)
  TO service_role;

COMMENT ON FUNCTION public.attribute_multiplix_item_reply(text, text, text) IS
  'R2-DB-002: citacao exata (linked) inalterada; o eixo por telefone (inferred) exige identidade canonica do destino (DDD + 8 digitos) e a MESMA conexao do dispatch; o evento (p_message_id) e consumido UMA vez em reply_attribution_events. attributed=true so quando o UPDATE gravou. SECURITY DEFINER, service_role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) fail-closed: sem os objetos deste delta a migration aborta.
-- ─────────────────────────────────────────────────────────────────────────────
DO $guard$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(esperado.assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.phone_identity(text)'),
      ('public.attribute_talkx_reply(uuid,text,uuid)'),
      ('public.attribute_multiplix_item_reply(text,text,text)')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(esperado.assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'resposta_identidade_dedup_objetos: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'reply_attribution_events'
       AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'resposta_identidade_dedup_objetos: public.reply_attribution_events sem RLS';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.reply_attribution_events'::regclass
       AND contype = 'p'
  ) THEN
    RAISE EXCEPTION 'resposta_identidade_dedup_objetos: reply_attribution_events sem PK';
  END IF;
END;
$guard$;

-- >>> ROLLBACK-BEGIN
-- BEGIN;
--
-- -- 1) Corpos ANTERIORES das duas funcoes, copiados VERBATIM das migrations que os
-- --    criaram (com as mesmas ACLs, que os blocos trazem). O corpo antigo nao conhece
-- --    public.phone_identity nem public.reply_attribution_events.
--
-- CREATE OR REPLACE FUNCTION public.attribute_multiplix_item_reply(
--   p_phone              text,
--   p_message_id         text,
--   p_quoted_external_id text DEFAULT NULL
-- )
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_message_id text := NULLIF(btrim(COALESCE(p_message_id, '')), '');
--   v_quoted     text := NULLIF(btrim(COALESCE(p_quoted_external_id, '')), '');
--   v_digits     text;
--   v_tail       text;
--   v_window     numeric;
--   v_cutoff     timestamptz;
--   v_item_id    uuid;
--   v_attribution text;
--   v_dispatch   uuid;
-- BEGIN
--   IF COALESCE(auth.role(), '') <> 'service_role' THEN
--     RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
--   END IF;
--   IF v_message_id IS NULL THEN
--     RAISE EXCEPTION 'invalid_multiplix_reply' USING ERRCODE = '22023';
--   END IF;
--   IF length(v_message_id) > 512 OR (v_quoted IS NOT NULL AND length(v_quoted) > 512) THEN
--     RAISE EXCEPTION 'invalid_multiplix_reply' USING ERRCODE = '22023';
--   END IF;
--
--   -- Normaliza o telefone do chamador uma unica vez; sem digitos suficientes nao da
--   -- para correlacionar com seguranca (devolve "nao atribuido" em vez de chutar).
--   v_digits := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
--   IF length(v_digits) < 8 THEN
--     RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'invalid_phone');
--   END IF;
--   v_tail := right(v_digits, 8);
--
--   -- `value` e jsonb: `#>> '{}'` extrai o escalar como texto antes do cast. Escrever
--   -- NULLIF(value,'') direto quebra em runtime (jsonb vs text), nao em tempo de criacao.
--   SELECT COALESCE(NULLIF(value #>> '{}', '')::numeric, 72) INTO v_window
--     FROM public.talkx_settings WHERE key = 'reply_window_hours' LIMIT 1;
--   IF v_window IS NULL OR v_window <= 0 THEN
--     v_window := 72;
--   END IF;
--   v_cutoff := statement_timestamp() - make_interval(hours => v_window::int);
--
--   -- (1) `linked`: a resposta citou uma mensagem nossa e o external_id casou. Correlacao exata.
--   IF v_quoted IS NOT NULL THEN
--     SELECT item.id, item.dispatch_id
--       INTO v_item_id, v_dispatch
--       FROM public.multiplix_delivery_items AS item
--      WHERE item.external_id = v_quoted
--        AND item.replied_at IS NULL
--        AND item.sent_at IS NOT NULL
--        AND item.sent_at >= v_cutoff
--      ORDER BY item.sent_at DESC
--      LIMIT 1;
--     IF v_item_id IS NOT NULL THEN
--       v_attribution := 'linked';
--     END IF;
--   END IF;
--
--   -- (2) `inferred`: sem citacao utilizavel, atribui pelo item mais recente daquele TELEFONE
--   -- na janela. O casamento por sufixo de 8 digitos e o que impede atribuir a resposta de um
--   -- numero ao envio de OUTRO (o modo de falha que a flag `inferred` denuncia).
--   IF v_item_id IS NULL THEN
--     SELECT item.id, item.dispatch_id
--       INTO v_item_id, v_dispatch
--       FROM public.multiplix_delivery_items AS item
--       JOIN public.multiplix_recipients AS recipient ON recipient.id = item.recipient_id
--      WHERE right(regexp_replace(COALESCE(recipient.destino_e164, ''), '\D', '', 'g'), 8) = v_tail
--        AND item.replied_at IS NULL
--        AND item.sent_at IS NOT NULL
--        AND item.sent_at >= v_cutoff
--      ORDER BY item.sent_at DESC
--      LIMIT 1;
--     IF v_item_id IS NOT NULL THEN
--       v_attribution := 'inferred';
--     END IF;
--   END IF;
--
--   IF v_item_id IS NULL THEN
--     RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'no_item_in_window');
--   END IF;
--
--   UPDATE public.multiplix_delivery_items
--      SET replied_at         = statement_timestamp(),
--          reply_attribution  = v_attribution,
--          updated_at         = statement_timestamp()
--    WHERE id = v_item_id
--      AND replied_at IS NULL;
--
--   RETURN jsonb_build_object(
--     'attributed', true,
--     'attribution', v_attribution,
--     'item_id', v_item_id,
--     'dispatch_id', v_dispatch
--   );
-- END;
-- $function$;
--
-- COMMENT ON FUNCTION public.attribute_multiplix_item_reply(text, text, text) IS
--   'F62b: correlaciona a resposta do contato ao item pelo TELEFONE (multiplix_recipients nao tem contact_id). linked = external_id citado casou; inferred = janela + telefone. Nao altera status; idempotente por replied_at IS NULL. Substitui a v1 (20261002701230), que lia talkx_settings.value como texto e quebrava na 1a chamada.';
--
-- REVOKE ALL ON FUNCTION public.attribute_multiplix_item_reply(text, text, text) FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.attribute_multiplix_item_reply(text, text, text) TO service_role;
--
-- CREATE OR REPLACE FUNCTION public.attribute_talkx_reply(
--   p_contact_id uuid,
--   p_phone      text,
--   p_message_id uuid
-- ) RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_temp
-- AS $function$
-- DECLARE
--   v_digits    text;
--   v_tail      text;
--   v_window    numeric;
--   v_cutoff    timestamptz;
--   v_recipient_id uuid;
--   v_campaign_id  uuid;
--   v_contact_id   uuid;
--   v_attribution  text;
-- BEGIN
--   IF COALESCE(auth.role(), '') <> 'service_role' THEN
--     RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
--   END IF;
--   IF p_message_id IS NULL THEN
--     RAISE EXCEPTION 'invalid_talkx_reply' USING ERRCODE = '22023';
--   END IF;
--
--   -- Telefone normalizado: só o sufixo de 8 dígitos casa (tolera DDI/DDD/9º dígito).
--   v_digits := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
--   v_tail := CASE WHEN length(v_digits) >= 8 THEN right(v_digits, 8) ELSE NULL END;
--
--   IF p_contact_id IS NULL AND v_tail IS NULL THEN
--     RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'no_subject');
--   END IF;
--
--   -- reply_window_hours é jsonb; `#>> '{}'` extrai o escalar como TEXTO antes do cast
--   -- (NULLIF(jsonb, '') não existe — quebra em runtime, não na criação).
--   SELECT COALESCE(NULLIF(value #>> '{}', '')::numeric, 72) INTO v_window
--     FROM public.talkx_settings WHERE key = 'reply_window_hours' LIMIT 1;
--   IF v_window IS NULL OR v_window <= 0 THEN
--     v_window := 72;
--   END IF;
--   v_cutoff := statement_timestamp() - make_interval(hours => v_window::int);
--
--   -- (1) contato exato; (2) mesmo telefone (cobre contato LID/duplicado com outro
--   -- contact_id). Destinatário mais recente dentro da janela, ainda sem resposta.
--   SELECT recipient.id, recipient.campaign_id, recipient.contact_id
--     INTO v_recipient_id, v_campaign_id, v_contact_id
--     FROM public.talkx_recipients AS recipient
--     LEFT JOIN public.contacts AS contact ON contact.id = recipient.contact_id
--    WHERE recipient.replied_at IS NULL
--      AND recipient.sent_at IS NOT NULL
--      AND recipient.sent_at >= v_cutoff
--      AND (
--        (p_contact_id IS NOT NULL AND recipient.contact_id = p_contact_id)
--        OR (
--          v_tail IS NOT NULL
--          AND right(regexp_replace(COALESCE(contact.phone, ''), '\D', '', 'g'), 8) = v_tail
--        )
--      )
--    ORDER BY recipient.sent_at DESC, recipient.id DESC
--    LIMIT 1
--    FOR UPDATE OF recipient;
--
--   IF v_recipient_id IS NULL THEN
--     RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'no_recipient_in_window');
--   END IF;
--
--   v_attribution := CASE
--     WHEN p_contact_id IS NOT NULL AND v_contact_id = p_contact_id THEN 'contact'
--     ELSE 'phone'
--   END;
--
--   UPDATE public.talkx_recipients
--      SET replied_at = statement_timestamp(),
--          reply_message_id = p_message_id,
--          updated_at = statement_timestamp()
--    WHERE id = v_recipient_id
--      AND replied_at IS NULL;
--
--   RETURN jsonb_build_object(
--     'attributed', true,
--     'attribution', v_attribution,
--     'recipient_id', v_recipient_id,
--     'campaign_id', v_campaign_id
--   );
-- END;
-- $function$;
--
-- REVOKE ALL ON FUNCTION public.attribute_talkx_reply(uuid, text, uuid)
--   FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.attribute_talkx_reply(uuid, text, uuid)
--   TO service_role;
--
-- COMMENT ON FUNCTION public.attribute_talkx_reply(uuid, text, uuid) IS
--   'Talk X (X027): grava replied_at/reply_message_id no destinatário mais recente do contato OU do telefone (sufixo de 8 dígitos) dentro de talkx_settings.reply_window_hours. Substitui a atribuição client-side da edge (attributeTalkXReply). SECURITY DEFINER, service_role.';
--
-- -- 2) Evento recebido: a tabela nasce e morre VAZIA de historico. Os eventos ja
-- --    consumidos por ela NAO voltam (nao ha como reconstruir quais atribuicoes eram
-- --    legitimas). Nenhuma linha de talkx_recipients / multiplix_delivery_items foi
-- --    alterada por esta migration, entao nenhum dado de atribuicao precisa voltar.
-- REVOKE ALL ON public.reply_attribution_events FROM PUBLIC, anon, authenticated;
-- DROP TABLE IF EXISTS public.reply_attribution_events;
--
-- -- 3) Helper novo (nao existia antes desta migration).
-- REVOKE ALL ON FUNCTION public.phone_identity(text)
--   FROM PUBLIC, anon, authenticated, service_role;
-- DROP FUNCTION IF EXISTS public.phone_identity(text);
--
-- COMMIT;
-- <<< ROLLBACK-END
