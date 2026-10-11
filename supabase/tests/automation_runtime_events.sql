-- automation_runtime_events — T1..T9 sobre a fila REAL de eventos de automação e os gatilhos de
-- entrada de mensagem/tag (migration supabase/migrations/20261011190932_automation_runtime.sql).
--
-- O QUE PROVA.
--   T1 anti-laço (mensagem): mensagem com sender='agent' (é assim que a própria automação envia)
--      NÃO enfileira nenhum evento;
--   T2 new_message: mensagem do contato (sender='contact') enfileira 1 evento new_message com
--      payload '{}' (sem texto);
--   T3 keyword: só os TERMOS CASADOS são gravados (payload->'matched_terms'), o texto da mensagem
--      NÃO vai para a fila, e termo não casado não entra;
--   T4 deduplicação da fila: inserir de novo o mesmo evento (mesmo trigger_type/trigger_ref/contact_id)
--      cai com unique_violation 23505;
--   T5 tag_added: UPDATE de public.contacts.tags enfileira 1 evento por tag ACRESCENTADA, com a tag
--      no payload; 'vip' e 'VIP' são a mesma tag; UPDATE sem mexer em tags não enfileira;
--   T6 dedupe de tag: a MESMA tag não enfileira duas vezes para o mesmo contacto (chave natural);
--   T7 anti-laço (tag): com zapp.suppress_automation_events='on' a escrita do motor não enfileira;
--   T8 idempotência de execuções: a chave natural (automation_id, contact_id, trigger_ref) impede
--      rodar a mesma automação duas vezes para o mesmo evento (23505);
--   T9 permissões: staff (admin) lê as duas tabelas; agente comum lê 0 linhas; anon não lê
--      (permission denied); authenticated não escreve na fila (permission denied); service_role escreve;
--      RLS ligada e política explícita (nada de USING(true)).
--   BLOCO C (rollback): quando rodado com -v rollback=<arquivo>, executa o bloco "-- Rollback
--      (completo)" extraído do próprio arquivo da migration, confere que o estado voltou e reaplica.
--
-- COMO RODA. Em Postgres descartável; fixtures e asserções numa transação que termina em ROLLBACK —
-- zero efeito colateral e idempotente. A superfície mínima do Supabase é criada À MÃO aqui
-- (roles anon/authenticated/service_role, schema auth com auth.uid(), public.contacts/automations/
-- messages/user_roles, is_admin_or_supervisor). Papel de usuário sempre por SET LOCAL ROLE dentro de
-- DO $$ ... $$, nunca superusuário/dono:
--   docker run --rm -d --name zapp-v2-autoruntime-$$ -v "$PWD:/repo:ro" \
--     -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   sed -n 's/^-- > //p' supabase/migrations/20261011190932_automation_runtime.sql > .tmp/rollback.sql
--   docker exec -i zapp-v2-autoruntime-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/supabase/migrations/20261011190932_automation_runtime.sql \
--     -v rollback=/repo/.tmp/rollback.sql \
--     < supabase/tests/automation_runtime_events.sql
-- VERMELHO esperado sem a migration: o mesmo comando com -v sem_migration=1 falha já em T1
-- (public.automation_events não existe).

\set ON_ERROR_STOP on

\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261011190932_automation_runtime.sql'
  \endif
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão (forma ANTERIOR à migration: nenhuma tabela de runtime)
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

CREATE TABLE public.contacts (
  id   uuid PRIMARY KEY,
  name text,
  tags text[] DEFAULT '{}'::text[]
);
GRANT SELECT, INSERT, UPDATE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;

CREATE TABLE public.automations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  trigger_type   text NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions        jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role    text NOT NULL,
  PRIMARY KEY (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = _user_id AND ur.role IN ('admin', 'supervisor')
  ) $$;

CREATE TABLE public.messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   uuid,
  sender       text,
  content      text,
  is_deleted   boolean,
  channel_type text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

-- ---------------------------------------------------------------------------
-- Fixtures (postgres)
-- ---------------------------------------------------------------------------
INSERT INTO public.contacts (id, name, tags)
VALUES ('aaaaaaaa-0000-0000-0000-000000000101', 'Cliente Teste', '{}'::text[]);
-- tags NULL: o gatilho tem de aguentar OLD.tags NULL
INSERT INTO public.contacts (id, name, tags)
VALUES ('aaaaaaaa-0000-0000-0000-000000000102', 'Sem tags', NULL);

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-0000-0000-0000-000000000001', 'admin'),
  ('22222222-0000-0000-0000-000000000002', 'agent');

INSERT INTO public.automations (id, name, is_active, trigger_type, trigger_config) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Boas-vindas',   true,  'new_message', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'Palavra-chave', true,  'keyword',
   '{"keywords": ["preço", "orçamento"], "match": "any"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'Etiquetar',     true,  'tag_added',   '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-0000000000a4', 'Inativa',       false, 'new_message', '{}'::jsonb);

-- ---------------------------------------------------------------------------
-- Migration sob teste (o arquivo real do repositório)
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
\else
\i :mig
\endif

-- ---------------------------------------------------------------------------
-- T1 — ANTI-LAÇO: mensagem enviada pela automação (sender='agent') não enfileira
-- ---------------------------------------------------------------------------
INSERT INTO public.messages (id, contact_id, sender, content, channel_type)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000101', 'agent', 'Olá! Como podemos ajudar?', 'whatsapp');
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.automation_events;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T1 anti-laço FALHOU: mensagem de agente gerou % evento(s)', v_n;
  END IF;
  RAISE NOTICE 'T1 OK: mensagem de agente (automação) não enfileirou gatilho';
END $$;

-- ---------------------------------------------------------------------------
-- T2 — new_message: mensagem do contato enfileira 1 evento, payload vazio
-- ---------------------------------------------------------------------------
INSERT INTO public.messages (id, contact_id, sender, content, channel_type)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000101', 'contact', 'Oi, tudo bem?', 'whatsapp');
DO $$
DECLARE v_n integer; v_payload jsonb;
BEGIN
  SELECT count(*) INTO v_n FROM public.automation_events
   WHERE trigger_type = 'new_message'
     AND trigger_ref = 'bbbbbbbb-0000-0000-0000-000000000002'
     AND contact_id = 'aaaaaaaa-0000-0000-0000-000000000101';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T2 FALHOU: esperava 1 evento new_message, achei %', v_n;
  END IF;
  SELECT payload INTO v_payload FROM public.automation_events
   WHERE trigger_type = 'new_message'
     AND trigger_ref = 'bbbbbbbb-0000-0000-0000-000000000002';
  IF v_payload <> '{}'::jsonb THEN
    RAISE EXCEPTION 'T2 FALHOU: payload deveria ser {} e veio %', v_payload;
  END IF;
  RAISE NOTICE 'T2 OK: mensagem do contato enfileirou 1 new_message, payload {}';
END $$;

-- ---------------------------------------------------------------------------
-- T3 — keyword: SÓ os termos casados, nunca o texto da mensagem
-- ---------------------------------------------------------------------------
INSERT INTO public.messages (id, contact_id, sender, content, channel_type)
VALUES ('bbbbbbbb-0000-0000-0000-000000000003',
        'aaaaaaaa-0000-0000-0000-000000000101', 'contact',
        'Bom dia! Qual é o PREÇO da caneca personalizada?', 'whatsapp');
DO $$
DECLARE v_payload jsonb; v_termos jsonb;
BEGIN
  SELECT payload INTO v_payload FROM public.automation_events
   WHERE trigger_type = 'keyword'
     AND trigger_ref = 'bbbbbbbb-0000-0000-0000-000000000003';
  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'T3 FALHOU: nenhum evento keyword gerado';
  END IF;
  v_termos := v_payload -> 'matched_terms';
  IF v_termos IS NULL OR v_termos <> '["preço"]'::jsonb THEN
    RAISE EXCEPTION 'T3 FALHOU: matched_terms deveria ser ["preço"] e veio %', v_termos;
  END IF;
  IF v_payload ? 'content' OR v_payload ? 'text' THEN
    RAISE EXCEPTION 'T3 FALHOU: payload levou texto de mensagem: %', v_payload;
  END IF;
  IF position('caneca' in v_payload::text) > 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: payload vazou o texto da mensagem: %', v_payload;
  END IF;
  IF position('orçamento' in v_payload::text) > 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: termo NÃO casado entrou no payload: %', v_payload;
  END IF;
  RAISE NOTICE 'T3 OK: keyword gravou só os termos casados, sem o texto da mensagem';
END $$;

-- ---------------------------------------------------------------------------
-- T4 — deduplicação da fila: mesmo gatilho/origem/contacto não duplica
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.automation_events (contact_id, trigger_type, trigger_ref)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000101', 'new_message',
            'bbbbbbbb-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'T4 FALHOU: evento duplicado foi aceito';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'T4 OK: evento duplicado rejeitado com unique_violation';
  END;
END $$;

-- ---------------------------------------------------------------------------
-- T5 — tag_added: só os valores acrescentados; caixa não diferencia; outro
--      UPDATE (sem mexer em tags) não enfileira
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer; v_payload jsonb;
BEGIN
  -- UPDATE como authenticated (é o caminho do painel) — o gatilho é SECURITY DEFINER
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','11111111-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.contacts SET tags = ARRAY['VIP'] WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101';
  RESET ROLE;

  SELECT count(*) INTO v_n FROM public.automation_events WHERE trigger_type = 'tag_added';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T5 FALHOU: esperava 1 tag_added, achei %', v_n; END IF;
  SELECT payload INTO v_payload FROM public.automation_events
   WHERE trigger_type = 'tag_added' AND trigger_ref = 'vip';
  IF v_payload ->> 'tag' <> 'VIP' THEN
    RAISE EXCEPTION 'T5 FALHOU: payload sem a tag acrescentada: %', v_payload;
  END IF;

  -- acrescenta 'Bloqueado': +1 evento
  UPDATE public.contacts SET tags = ARRAY['VIP','Bloqueado']
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101';
  SELECT count(*) INTO v_n FROM public.automation_events WHERE trigger_type = 'tag_added';
  IF v_n <> 2 THEN RAISE EXCEPTION 'T5 FALHOU: esperava 2 tag_added, achei %', v_n; END IF;

  -- 'VIP' já existe (mesma tag em outra caixa): NÃO é acréscimo
  UPDATE public.contacts SET tags = ARRAY['vip','Bloqueado','novo']
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101';
  SELECT count(*) INTO v_n FROM public.automation_events WHERE trigger_type = 'tag_added';
  IF v_n <> 3 THEN RAISE EXCEPTION 'T5 FALHOU: esperava 3 tag_added (só ''novo''), achei %', v_n; END IF;

  -- UPDATE que não toca em tags não dispara nada
  UPDATE public.contacts SET name = 'Cliente Teste 2'
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101';
  SELECT count(*) INTO v_n FROM public.automation_events WHERE trigger_type = 'tag_added';
  IF v_n <> 3 THEN RAISE EXCEPTION 'T5 FALHOU: UPDATE sem tags enfileirou evento (%)', v_n; END IF;

  RAISE NOTICE 'T5 OK: tag_added só para valores acrescentados, caixa não diferencia';
END $$;

-- ---------------------------------------------------------------------------
-- T6 — dedupe de tag: a mesma tag não enfileira duas vezes para o mesmo contacto
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  UPDATE public.contacts SET tags = ARRAY['Bloqueado']
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101';   -- remove VIP e novo
  UPDATE public.contacts SET tags = ARRAY['Bloqueado','VIP']
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101';   -- readiciona VIP
  SELECT count(*) INTO v_n FROM public.automation_events
   WHERE trigger_type = 'tag_added' AND trigger_ref = 'vip' AND contact_id = 'aaaaaaaa-0000-0000-0000-000000000101';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T6 FALHOU: VIP enfileirou % vezes para o mesmo contacto', v_n;
  END IF;
  RAISE NOTICE 'T6 OK: tag repetida não duplica evento (chave natural por contacto+tag)';
END $$;

-- ---------------------------------------------------------------------------
-- T7 — ANTI-LAÇO (tag): switch do motor suprime o enfileiramento
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('zapp.suppress_automation_events', 'on', true);
  UPDATE public.contacts SET tags = ARRAY['Bloqueado','VIP','da-automacao']
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101';
  SELECT count(*) INTO v_n FROM public.automation_events WHERE trigger_ref = 'da-automacao';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T7 FALHOU: switch não suprimiu o evento'; END IF;

  -- mensagem com o switch ligado também não enfileira
  INSERT INTO public.messages (id, contact_id, sender, content)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000009',
          'aaaaaaaa-0000-0000-0000-000000000101', 'contact', 'mensagem do motor');
  SELECT count(*) INTO v_n FROM public.automation_events
   WHERE trigger_ref = 'bbbbbbbb-0000-0000-0000-000000000009';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T7 FALHOU: switch não suprimiu o evento de mensagem'; END IF;

  PERFORM set_config('zapp.suppress_automation_events', '', true);
  RAISE NOTICE 'T7 OK: switch zapp.suppress_automation_events suprime tag e mensagem';
END $$;

-- ---------------------------------------------------------------------------
-- T8 — idempotência das execuções: chave natural impede rodar duas vezes
-- ---------------------------------------------------------------------------
INSERT INTO public.automation_executions
  (automation_id, contact_id, trigger_type, trigger_ref, status, actions_done)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000101',
        'new_message', 'bbbbbbbb-0000-0000-0000-000000000002', 'ok',
        '[{"type":"send_message"}]'::jsonb);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.automation_executions
      (automation_id, contact_id, trigger_type, trigger_ref, status)
    VALUES ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000101',
            'new_message', 'bbbbbbbb-0000-0000-0000-000000000002', 'ok');
    RAISE EXCEPTION 'T8 FALHOU: execução duplicada foi aceita';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'T8 OK: execução duplicada rejeitada com unique_violation';
  END;
END $$;

-- ---------------------------------------------------------------------------
-- T9 — permissões: staff lê, agente comum não, anon não, escrita só service_role;
--      RLS ligada com política explícita
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','11111111-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.automation_executions;
  IF v_n < 1 THEN RAISE EXCEPTION 'T9 FALHOU: admin deveria ler execuções'; END IF;
  SELECT count(*) INTO v_n FROM public.automation_events;
  IF v_n < 1 THEN RAISE EXCEPTION 'T9 FALHOU: admin deveria ler eventos'; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','22222222-0000-0000-0000-000000000002','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.automation_executions;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T9 FALHOU: agente comum leu % execuções', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.automation_events;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T9 FALHOU: agente comum leu % eventos', v_n; END IF;
  BEGIN
    INSERT INTO public.automation_events (contact_id, trigger_type, trigger_ref)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000101', 'new_message', 'forjado');
    RAISE EXCEPTION 'T9 FALHOU: authenticated conseguiu escrever na fila';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO v_n FROM public.automation_events;
    RAISE EXCEPTION 'T9 FALHOU: anon leu a fila (% linhas)', v_n;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  SET LOCAL ROLE service_role;
  INSERT INTO public.automation_events (contact_id, trigger_type, trigger_ref)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000101', 'new_message', 'pelo-motor');
  RESET ROLE;

  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('automation_events','automation_executions')
     AND c.relrowsecurity;
  IF v_n <> 2 THEN RAISE EXCEPTION 'T9 FALHOU: RLS não ligada nas duas tabelas (%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('automation_events','automation_executions')
     AND policyname IN ('automation_events_select_staff','automation_executions_select_staff');
  IF v_n <> 2 THEN RAISE EXCEPTION 'T9 FALHOU: política explícita ausente (%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('automation_events','automation_executions')
     AND coalesce(qual, '') IN ('true', '(true)');
  IF v_n <> 0 THEN RAISE EXCEPTION 'T9 FALHOU: policy USING(true) encontrada'; END IF;

  RAISE NOTICE 'T9 OK: permissões e RLS conferidas (staff lê, agente/anon não, escrita só service_role)';
END $$;

-- ---------------------------------------------------------------------------
-- T10 — ENTRADA INVÁLIDA/EXTREMA: nulo, vazio, apagada e formato errado não
--       quebram o gatilho nem inventam evento
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  -- (a) mensagem sem contact_id não enfileira e não estoura
  INSERT INTO public.messages (id, contact_id, sender, content)
  VALUES ('bbbbbbbb-0000-0000-0000-00000000000a', NULL, 'contact', 'sem contato');
  -- (b) mensagem apagada (soft delete) não enfileira
  INSERT INTO public.messages (id, contact_id, sender, content, is_deleted)
  VALUES ('bbbbbbbb-0000-0000-0000-00000000000b',
          'aaaaaaaa-0000-0000-0000-000000000101', 'contact', 'apagada', true);
  SELECT count(*) INTO v_n FROM public.automation_events
   WHERE trigger_ref IN ('bbbbbbbb-0000-0000-0000-00000000000a','bbbbbbbb-0000-0000-0000-00000000000b');
  IF v_n <> 0 THEN RAISE EXCEPTION 'T10 FALHOU: mensagem sem contato/apagada enfileirou'; END IF;

  -- (c) contact com tags NULL: OLD.tags NULL não pode derrubar nem duplicar
  UPDATE public.contacts SET tags = ARRAY['primeiro','PRIMEIRO']
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000102';
  SELECT count(*) INTO v_n FROM public.automation_events
   WHERE contact_id = 'aaaaaaaa-0000-0000-0000-000000000102' AND trigger_ref = 'primeiro';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T10 FALHOU: OLD.tags NULL/duplicados geraram % evento(s)', v_n; END IF;

  -- (d) keywords fora do formato array não pode derrubar o INSERT da mensagem
  UPDATE public.automations SET is_active = false WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000a2';
  INSERT INTO public.automations (id, name, is_active, trigger_type, trigger_config)
  VALUES ('aaaaaaaa-0000-0000-0000-0000000000a5', 'Formato errado', true, 'keyword',
          '{"keywords": "preço"}'::jsonb);
  INSERT INTO public.messages (id, contact_id, sender, content)
  VALUES ('bbbbbbbb-0000-0000-0000-00000000000c',
          'aaaaaaaa-0000-0000-0000-000000000101', 'contact', 'preço');
  SELECT count(*) INTO v_n FROM public.automation_events
   WHERE trigger_type = 'keyword' AND trigger_ref = 'bbbbbbbb-0000-0000-0000-00000000000c';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T10 FALHOU: keywords string virou evento'; END IF;
  UPDATE public.automations SET is_active = true WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000a2';

  RAISE NOTICE 'T10 OK: nulo, apagada, tags NULL e keywords malformado tratados sem evento indevido';
END $$;

-- ---------------------------------------------------------------------------
-- BLOCO C — rollback executável devolve o estado; reaplicar é idempotente
-- ---------------------------------------------------------------------------
\if :{?rollback}
\i :rollback
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('automation_events','automation_executions');
  IF v_n <> 0 THEN RAISE EXCEPTION 'C1 FALHOU: tabelas sobreviveram ao rollback'; END IF;
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('enqueue_automation_events_on_message','enqueue_automation_events_on_tags');
  IF v_n <> 0 THEN RAISE EXCEPTION 'C1 FALHOU: funções sobreviveram ao rollback'; END IF;
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgname IN ('trg_automation_events_on_message','trg_automation_events_on_tags');
  IF v_n <> 0 THEN RAISE EXCEPTION 'C1 FALHOU: gatilhos sobreviveram ao rollback'; END IF;
  RAISE NOTICE 'C1 OK: rollback removeu tabelas, funções e gatilhos';
END $$;
\i :mig
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgname IN ('trg_automation_events_on_message','trg_automation_events_on_tags');
  IF v_n <> 2 THEN RAISE EXCEPTION 'C2 FALHOU: reaplicar não recriou os gatilhos (%)', v_n; END IF;
  RAISE NOTICE 'C2 OK: reaplicar a migration é idempotente';
END $$;
\endif

-- Nada sai do banco descartável: tudo volta atrás.
ROLLBACK;
