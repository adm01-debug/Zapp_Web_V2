-- indeterminate_optout_outbox — T1–T8 sobre o ingest/drain REAIS do #190
-- (supabase/migrations/20261007095739_indeterminate_optout_outbox.sql, cartão
--  t_89af1a99; teste do cartão t_5e529f7e).
--
-- O QUE PROVA (critério do cartão, item 1):
--   T1 ingest com decisão 'indeterminate' cria UM efeito 'optout_resolve' com
--      payload completo, SEM nenhuma atribuição e SEM supressão otimista;
--   T2 redelivery do mesmo external_id não duplica o efeito (chave única) e não
--      cria mensagem duplicada;
--   T3 drain com "não casou" (talkx_match_optout devolve NULL) libera as
--      atribuições talkx_reply + multiplix_reply UMA única vez e baixa o efeito;
--   T4 drain com "casou" (a fonte autoritativa REAL, que lê
--      talkx_optout_keywords) aplica SOMENTE a supressão, herdando a campanha do
--      envio mais recente, e não atribui nada;
--   T5 exceção da fonte autoritativa (tabela de palavras ausente) deixa
--      last_error preenchido, applied_at NULO e attempts incrementado — e a
--      reentrega resolve a pendência depois;
--   T6 p_from_me=true não cria efeito algum;
--   T7 decisão inválida aborta o ingest (22023) sem escrever nada;
--   T8 drain só é executável por service_role (42501 para authenticated).
--
-- Superfície mínima criada à mão (Postgres descartável): roles anon/
-- authenticated/service_role, schema auth com auth.uid()/auth.role(), o essencial
-- de contacts/messages/whatsapp_connections/talkx_recipients/talkx_blacklist e as
-- duas RPCs de atribuição de OUTRO subsistema, que aqui REGISTRAM a chamada em
-- optout_call_log em vez de escrever (a fronteira do teste é o drain). Os
-- objetos da fonte autoritativa (talkx_optout_keywords, talkx_match_optout e
-- talkx_suppress_contact) são os REAIS, aplicados da migration
-- 20261002581230_talkx_v4_x029_optout.sql. Papel de usuário sempre por
-- SET LOCAL ROLE + request.jwt.claims — nunca superusuário.
--
-- COMO RODA. Fixtures e asserções numa transação que termina em ROLLBACK (zero
-- efeito colateral, idempotente):
--   docker run --rm -d --name zapp-v2-outbox-$$ -v "$PWD:/repo:ro" \
--     -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-outbox-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/supabase/migrations/20261007095739_indeterminate_optout_outbox.sql \
--     -v mig_optout=/repo/supabase/migrations/20261002581230_talkx_v4_x029_optout.sql \
--     < supabase/tests/indeterminate_optout_outbox.sql
-- O arquivo cria roles e a superfície À MÃO: só roda em Postgres descartável (no
-- banco da tarefa as roles, as FKs e as tabelas já existem).
-- VERMELHO esperado sem a correção: o mesmo comando com -v sem_migration=1 falha
-- já em T1, porque public.ingest_inbound_message de 12 args não existe (42883).
--
-- NOTA DE DEPENDÊNCIA (t_89af1a99): a migration sob teste ainda não está na branch
-- do dia. Enquanto o integrador não a trouxer, aponte -v mig para a cópia exata do
-- commit 05ffa822a (sha256
-- 9b3eb85fa4ca693b780a719c516bb23d23dd901931b91b8984b12f18b111180d); depois de
-- integrada, o padrão supabase/migrations/20261007095739_indeterminate_optout_outbox.sql
-- já serve.

\set ON_ERROR_STOP on

-- Caminho do arquivo da migration sob teste: -v mig / -v mig_optout vencem o padrão.
\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261007095739_indeterminate_optout_outbox.sql'
  \endif
\endif

\if :{?mig_optout}
\else
  \set mig_optout 'supabase/migrations/20261002581230_talkx_v4_x029_optout.sql'
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão
-- ---------------------------------------------------------------------------
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Papéis/policies do Talk X (a fonte autoritativa é real; aqui só o suficiente
-- para as policies da migration de origem criarem sem erro).
CREATE TABLE public.profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE FUNCTION public.is_admin(p_user_id uuid) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT false $$;
CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT false $$;

CREATE TYPE public.talkx_blacklist_reason AS ENUM ('opt_out', 'bounce', 'spam', 'manual', 'other');

CREATE TABLE public.talkx_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

-- inbound_message_effects é criada pela própria migration sob teste.

CREATE TABLE public.contacts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                  text NOT NULL UNIQUE,
  name                   text,
  assigned_to            uuid,
  avatar_url             text,
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  conversation_status    text DEFAULT 'open',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.messages (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id             uuid,
  whatsapp_connection_id uuid,
  content                text,
  message_type           text,
  media_url              text,
  sender                 text,
  external_id            text,
  status                 text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_inbound_key UNIQUE (whatsapp_connection_id, external_id, sender)
);

CREATE FUNCTION public.phone_variants(p_phone text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[p_phone, regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')] $$;

-- Talk X: envios (gate de 30 dias do drain e herança de campanha) e blacklist.
CREATE TABLE public.talkx_recipients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  uuid,
  campaign_id uuid,
  sent_at     timestamptz
);

CREATE TABLE public.talkx_blacklist (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        uuid,
  phone             text,
  reason            text,
  reason_code       public.talkx_blacklist_reason,
  origin            text,
  source_message_id uuid,
  campaign_id       uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,
  removed_at        timestamptz
);

-- Fronteira de atribuição (outro subsistema): registra a chamada em vez de
-- escrever. O teste do drain mede QUANDO essas RPCs são chamadas e com quais
-- argumentos — e que nunca são chamadas no caminho de opt-out.
CREATE TABLE public.optout_call_log (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fn        text NOT NULL,
  args      jsonb NOT NULL,
  called_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.attribute_talkx_reply(
  p_contact_id uuid, p_phone text, p_message_id uuid
) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.optout_call_log (fn, args)
  VALUES ('attribute_talkx_reply',
          jsonb_build_object('contact_id', p_contact_id, 'phone', p_phone, 'message_id', p_message_id));
  RETURN jsonb_build_object('attributed', true, 'attribution', 'talkx', 'message_id', p_message_id);
END $$;

CREATE FUNCTION public.attribute_multiplix_item_reply(
  p_phone text, p_message_id text, p_quoted_external_id text
) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.optout_call_log (fn, args)
  VALUES ('attribute_multiplix_item_reply',
          jsonb_build_object('phone', p_phone, 'message_id', p_message_id,
                             'quoted_external_id', p_quoted_external_id));
  RETURN jsonb_build_object('attributed', true, 'attribution', 'multiplix', 'message_id', p_message_id);
END $$;

CREATE FUNCTION public.t190_assert(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT p_ok THEN
    RAISE EXCEPTION 'FALHOU: %', p_msg;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Migrations REAIS: fonte autoritativa do Talk X e o objeto sob teste
-- ---------------------------------------------------------------------------
\i :mig_optout

\if :{?sem_migration}
  \echo '### modo vermelho: migration sob teste NAO aplicada ###'
\else
  \i :mig
\endif

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Fixture de conexao: o ingest valida a FK de whatsapp_connections.
INSERT INTO public.whatsapp_connections (id) VALUES ('00000000-0000-0000-0000-0000000000c1');

-- ---------------------------------------------------------------------------
-- T1 — ingest 'indeterminate': 1 efeito optout_resolve, ZERO atribuição
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_conn uuid := '00000000-0000-0000-0000-0000000000c1';
  v_res  record;
  v_txt  text := 'Preciso cancelar minha assinatura';
  v_n    integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  SELECT * INTO v_res FROM public.ingest_inbound_message(
    v_conn, '+5511999990001', 'Ana Teste', v_txt, 'text', NULL, 'EXT-IND-1',
    statement_timestamp(), false, 'indeterminate', NULL, NULL);
  RESET ROLE;

  PERFORM public.t190_assert(v_res.outcome = 'inserted', 'T1: outcome ' || v_res.outcome || ' <> inserted');
  PERFORM public.t190_assert(v_res.message_id IS NOT NULL, 'T1: message_id nulo');
  PERFORM public.t190_assert(v_res.contact_created, 'T1: contato deveria nascer no ingest');

  SELECT count(*) INTO v_n FROM public.inbound_message_effects
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-1';
  PERFORM public.t190_assert(v_n = 1, 'T1: efeitos=' || v_n || ' (esperado 1)');

  SELECT count(*) INTO v_n FROM public.inbound_message_effects
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-1'
     AND effect = 'optout_resolve' AND applied_at IS NULL AND attempts = 0
     AND last_error IS NULL
     AND payload->>'message_id' = v_res.message_id::text
     AND payload->>'text' = v_txt
     AND payload->>'phone' = '+5511999990001'
     AND payload->>'quoted_external_id' IS NULL;
  PERFORM public.t190_assert(v_n = 1, 'T1: linha optout_resolve/payload nao confere');

  SELECT count(*) INTO v_n FROM public.inbound_message_effects
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-1'
     AND effect IN ('talkx_reply', 'multiplix_reply', 'optout_suppress');
  PERFORM public.t190_assert(v_n = 0, 'T1: decisao indeterminate criou atribuicao/supressao');

  SELECT count(*) INTO v_n FROM public.optout_call_log;
  PERFORM public.t190_assert(v_n = 0, 'T1: RPC de atribuicao chamada no ingest');
  SELECT count(*) INTO v_n FROM public.talkx_blacklist;
  PERFORM public.t190_assert(v_n = 0, 'T1: supressao otimista no ingest');

  PERFORM public.t190_assert(
    (SELECT status FROM public.messages WHERE id = v_res.message_id) = 'received',
    'T1: mensagem deveria nascer received');

  RAISE NOTICE 'T1 OK — ingest indeterminate enfileira optout_resolve e nada mais';
END $$;

-- ---------------------------------------------------------------------------
-- T2 — redelivery do mesmo evento não duplica o efeito
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_conn uuid := '00000000-0000-0000-0000-0000000000c1';
  v_res  record;
  v_n    integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  SELECT * INTO v_res FROM public.ingest_inbound_message(
    v_conn, '+5511999990001', 'Ana Teste', 'Preciso cancelar minha assinatura', 'text', NULL,
    'EXT-IND-1', statement_timestamp(), false, 'indeterminate', NULL, NULL);
  RESET ROLE;

  PERFORM public.t190_assert(v_res.outcome = 'updated', 'T2: redelivery outcome ' || v_res.outcome || ' <> updated');

  SELECT count(*) INTO v_n FROM public.inbound_message_effects
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-1' AND effect = 'optout_resolve';
  PERFORM public.t190_assert(v_n = 1, 'T2: efeito duplicado (linhas=' || v_n || ')');

  SELECT count(*) INTO v_n FROM public.messages
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-1' AND sender = 'contact';
  PERFORM public.t190_assert(v_n = 1, 'T2: mensagem duplicada (linhas=' || v_n || ')');

  SELECT count(*) INTO v_n FROM public.inbound_message_effects
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-1' AND attempts = 0;
  PERFORM public.t190_assert(v_n = 1, 'T2: redelivery mexeu na pendencia ainda nao drenada');

  RAISE NOTICE 'T2 OK — redelivery nao duplica efeito nem mensagem';
END $$;

-- ---------------------------------------------------------------------------
-- T3 — drain com "não casou" libera as atribuições UMA vez
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_conn uuid := '00000000-0000-0000-0000-0000000000c1';
  v_res  jsonb;
  v_msg  text;
  v_n    integer;
BEGIN
  SELECT payload->>'message_id' INTO v_msg FROM public.inbound_message_effects
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-1' AND effect = 'optout_resolve';
  PERFORM public.t190_assert(
    public.talkx_match_optout('Preciso cancelar minha assinatura') IS NULL,
    'T3: o texto do cenario deveria ser "nao casou" na fonte autoritativa');

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  SELECT public.drain_inbound_message_effects(v_conn, 'EXT-IND-1') INTO v_res;
  RESET ROLE;

  PERFORM public.t190_assert((v_res->>'pending_failed')::int = 0, 'T3: pending_failed=' || (v_res->>'pending_failed'));
  PERFORM public.t190_assert((v_res->>'talkx_reply')::jsonb->>'attributed' = 'true', 'T3: talkx_reply nao liberado');
  PERFORM public.t190_assert((v_res->>'multiplix_reply')::jsonb->>'attributed' = 'true', 'T3: multiplix_reply nao liberado');

  SELECT count(*) INTO v_n FROM public.optout_call_log;
  PERFORM public.t190_assert(v_n = 2, 'T3: chamadas de atribuicao=' || v_n || ' (esperado 2)');

  SELECT count(*) INTO v_n FROM public.optout_call_log
   WHERE fn = 'attribute_talkx_reply'
     AND args->>'message_id' = v_msg
     AND args->>'phone' = '+5511999990001'
     AND args->>'contact_id' = (SELECT contact_id::text FROM public.messages WHERE id = v_msg::uuid);
  PERFORM public.t190_assert(v_n = 1, 'T3: attribute_talkx_reply com argumentos errados');

  SELECT count(*) INTO v_n FROM public.optout_call_log
   WHERE fn = 'attribute_multiplix_item_reply'
     AND args->>'message_id' = v_msg
     AND args->>'phone' = '+5511999990001'
     AND args->>'quoted_external_id' IS NULL;
  PERFORM public.t190_assert(v_n = 1, 'T3: attribute_multiplix_item_reply com argumentos errados');

  SELECT count(*) INTO v_n FROM public.inbound_message_effects
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-1'
     AND applied_at IS NOT NULL AND last_error IS NULL AND attempts = 1;
  PERFORM public.t190_assert(v_n = 1, 'T3: efeito nao foi baixado exatamente uma vez');

  SELECT count(*) INTO v_n FROM public.talkx_blacklist;
  PERFORM public.t190_assert(v_n = 0, 'T3: "nao casou" criou supressao');
  RAISE NOTICE 'T3 OK — "nao casou" libera as duas atribuicoes e baixa o efeito';
END $$;

-- T3b — nova drenagem do mesmo evento não repete a atribuição
DO $$
DECLARE
  v_conn uuid := '00000000-0000-0000-0000-0000000000c1';
  v_res  jsonb;
  v_n    integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  SELECT public.drain_inbound_message_effects(v_conn, 'EXT-IND-1') INTO v_res;
  RESET ROLE;

  PERFORM public.t190_assert((v_res->>'pending_failed')::int = 0, 'T3b: pending_failed != 0');
  PERFORM public.t190_assert(v_res->>'talkx_reply' IS NULL, 'T3b: atribuicao repetida');
  SELECT count(*) INTO v_n FROM public.optout_call_log;
  PERFORM public.t190_assert(v_n = 2, 'T3b: chamadas de atribuicao=' || v_n || ' (esperado 2)');
  RAISE NOTICE 'T3b OK — a liberacao das atribuicoes acontece UMA vez';
END $$;

-- ---------------------------------------------------------------------------
-- T4 — drain com "casou": só supressão, herdando a campanha do último envio
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_conn    uuid := '00000000-0000-0000-0000-0000000000c1';
  v_camp    uuid := '00000000-0000-0000-0000-0000000000d1';
  v_res     record;
  v_drain   jsonb;
  v_msg     text;
  v_n       integer;
BEGIN
  PERFORM public.t190_assert(
    public.talkx_match_optout('sair') = 'sair',
    'T4: a fonte autoritativa deveria casar "sair"');

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  SELECT * INTO v_res FROM public.ingest_inbound_message(
    v_conn, '+5511999990001', 'Ana Teste', 'sair', 'text', NULL, 'EXT-IND-2',
    statement_timestamp(), false, 'indeterminate', NULL, NULL);
  RESET ROLE;

  SELECT count(*) INTO v_n FROM public.talkx_blacklist;
  PERFORM public.t190_assert(v_n = 0, 'T4: ingest indeterminate ja suprimiu (opt-out otimista)');
  SELECT count(*) INTO v_n FROM public.inbound_message_effects
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-2' AND effect = 'optout_resolve';
  PERFORM public.t190_assert(v_n = 1, 'T4: efeito optout_resolve ausente');

  SELECT payload->>'message_id' INTO v_msg FROM public.inbound_message_effects
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-2' AND effect = 'optout_resolve';

  -- envio recente (dentro dos 30 dias) com campanha: a supressao herda a campanha
  INSERT INTO public.talkx_recipients (contact_id, campaign_id, sent_at)
  VALUES (v_res.contact_id, v_camp, statement_timestamp());

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  SELECT public.drain_inbound_message_effects(v_conn, 'EXT-IND-2') INTO v_drain;
  RESET ROLE;

  PERFORM public.t190_assert((v_drain->>'pending_failed')::int = 0, 'T4: pending_failed=' || (v_drain->>'pending_failed'));
  PERFORM public.t190_assert(v_drain->>'optout_status' = 'suppressed', 'T4: optout_status=' || (v_drain->>'optout_status'));
  PERFORM public.t190_assert(v_drain->>'suppression_id' IS NOT NULL, 'T4: suppression_id nulo');

  SELECT count(*) INTO v_n FROM public.talkx_blacklist
   WHERE contact_id = v_res.contact_id
     AND reason = 'Opt-out via mensagem: sair'
     AND reason_code::text = 'opt_out'
     AND origin = 'auto_optout'
     AND campaign_id = v_camp
     AND source_message_id = v_msg::uuid
     AND removed_at IS NULL;
  PERFORM public.t190_assert(v_n = 1, 'T4: supressao nao registrada com contrato esperado');

  SELECT count(*) INTO v_n FROM public.optout_call_log;
  PERFORM public.t190_assert(v_n = 2, 'T4: "casou" atribuiu algo (chamadas=' || v_n || ')');

  SELECT count(*) INTO v_n FROM public.inbound_message_effects
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-2'
     AND applied_at IS NOT NULL AND last_error IS NULL AND attempts = 1;
  PERFORM public.t190_assert(v_n = 1, 'T4: efeito nao baixado apos supressao');
  RAISE NOTICE 'T4 OK — "casou" aplica so a supressao, com a campanha herdada';
END $$;

-- ---------------------------------------------------------------------------
-- T5 — exceção da fonte autoritativa conserva a pendência (last_error + applied_at nulo)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_conn  uuid := '00000000-0000-0000-0000-0000000000c1';
  v_res   record;
  v_drain jsonb;
  v_err   text;
  v_n     integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  SELECT * INTO v_res FROM public.ingest_inbound_message(
    v_conn, '+5511999990001', 'Ana Teste', 'quero sair da lista', 'text', NULL, 'EXT-IND-3',
    statement_timestamp(), false, 'indeterminate', NULL, NULL);
  RESET ROLE;

  -- a fonte autoritativa fica indisponivel (tabela de palavras ausente)
  ALTER TABLE public.talkx_optout_keywords RENAME TO talkx_optout_keywords_bak;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  SELECT public.drain_inbound_message_effects(v_conn, 'EXT-IND-3') INTO v_drain;
  RESET ROLE;

  PERFORM public.t190_assert((v_drain->>'pending_failed')::int = 1, 'T5: pending_failed=' || (v_drain->>'pending_failed') || ' (esperado 1)');

  SELECT last_error, attempts INTO v_err, v_n FROM public.inbound_message_effects
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-3' AND effect = 'optout_resolve';
  PERFORM public.t190_assert(v_err IS NOT NULL, 'T5: last_error nulo apos excecao');
  PERFORM public.t190_assert(position('talkx_optout_keywords' in v_err) > 0, 'T5: last_error inesperado: ' || v_err);
  PERFORM public.t190_assert(v_n = 1, 'T5: attempts=' || v_n || ' (esperado 1)');

  SELECT count(*) INTO v_n FROM public.inbound_message_effects
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-3'
     AND applied_at IS NULL AND effect = 'optout_resolve';
  PERFORM public.t190_assert(v_n = 1, 'T5: pendencia nao foi conservada (applied_at preenchido)');

  SELECT count(*) INTO v_n FROM public.optout_call_log;
  PERFORM public.t190_assert(v_n = 2, 'T5: excecao liberou atribuicao (chamadas=' || v_n || ')');

  -- reentrega: com a fonte de volta, a pendencia resolve
  ALTER TABLE public.talkx_optout_keywords_bak RENAME TO talkx_optout_keywords;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  SELECT public.drain_inbound_message_effects(v_conn, 'EXT-IND-3') INTO v_drain;
  RESET ROLE;

  PERFORM public.t190_assert((v_drain->>'pending_failed')::int = 0, 'T5b: pending_failed=' || (v_drain->>'pending_failed'));
  SELECT count(*) INTO v_n FROM public.inbound_message_effects
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-3'
     AND applied_at IS NOT NULL AND last_error IS NULL AND attempts = 2;
  PERFORM public.t190_assert(v_n = 1, 'T5b: pendencia nao resolveu na reentrega');
  SELECT count(*) INTO v_n FROM public.optout_call_log;
  PERFORM public.t190_assert(v_n = 4, 'T5b: atribuicoes=' || v_n || ' (esperado 4)');
  RAISE NOTICE 'T5 OK — excecao deixa last_error/applied_at nulo e a reentrega resolve';
END $$;

-- ---------------------------------------------------------------------------
-- T6 — p_from_me=true não cria efeito
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_conn uuid := '00000000-0000-0000-0000-0000000000c1';
  v_res  record;
  v_n    integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  SELECT * INTO v_res FROM public.ingest_inbound_message(
    v_conn, '+5511999990002', 'Eco', 'sair', 'text', NULL, 'EXT-IND-4',
    statement_timestamp(), true, 'indeterminate', NULL, NULL);
  RESET ROLE;

  SELECT count(*) INTO v_n FROM public.inbound_message_effects
   WHERE whatsapp_connection_id = v_conn AND external_id = 'EXT-IND-4';
  PERFORM public.t190_assert(v_n = 0, 'T6: p_from_me=true criou ' || v_n || ' efeito(s)');
  RAISE NOTICE 'T6 OK — p_from_me=true nao enfileira nada';
END $$;

-- ---------------------------------------------------------------------------
-- T7 — decisão inválida aborta o ingest inteiro (22023), sem escrever nada
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_conn    uuid := '00000000-0000-0000-0000-0000000000c1';
  v_state   text;
  v_erro    boolean := false;
  v_res     record;
  v_n       integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  BEGIN
    SELECT * INTO v_res FROM public.ingest_inbound_message(
      v_conn, '+5511999990003', 'Chute', 'sair', 'text', NULL, 'EXT-IND-BAD',
      statement_timestamp(), false, 'chute', NULL, NULL);
  EXCEPTION WHEN others THEN
    v_erro := true;
    v_state := SQLSTATE;
  END;
  RESET ROLE;

  PERFORM public.t190_assert(v_erro, 'T7: decisao invalida NAO abortou o ingest');
  PERFORM public.t190_assert(v_state = '22023', 'T7: SQLSTATE=' || v_state || ' (esperado 22023)');
  SELECT count(*) INTO v_n FROM public.messages WHERE external_id = 'EXT-IND-BAD';
  PERFORM public.t190_assert(v_n = 0, 'T7: mensagem meio-escrita (linhas=' || v_n || ')');
  SELECT count(*) INTO v_n FROM public.contacts WHERE phone = '+5511999990003';
  PERFORM public.t190_assert(v_n = 0, 'T7: contato meio-escrito');
  RAISE NOTICE 'T7 OK — contrato fechado: decisao invalida nao escreve nada';
END $$;

-- ---------------------------------------------------------------------------
-- T8 — drain só roda como service_role
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_conn  uuid := '00000000-0000-0000-0000-0000000000c1';
  v_state text;
  v_erro  boolean := false;
  v_res   jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.drain_inbound_message_effects(v_conn, 'EXT-IND-1') INTO v_res;
  EXCEPTION WHEN others THEN
    v_erro := true;
    v_state := SQLSTATE;
  END;
  RESET ROLE;

  PERFORM public.t190_assert(v_erro, 'T8: authenticated conseguiu drenar a outbox');
  PERFORM public.t190_assert(v_state = '42501', 'T8: SQLSTATE=' || v_state || ' (esperado 42501)');
  RAISE NOTICE 'T8 OK — drenagem e exclusiva de service_role';
END $$;

\echo '### TODOS OS CENARIOS (T1-T8) PASSARAM ###'
ROLLBACK;
