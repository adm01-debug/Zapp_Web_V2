-- csat_pipeline — prova do ciclo da pesquisa de satisfação (cartão t_69726cda).
--
-- O QUE PROVA (critério do cartão):
--   1) convite e resposta convivem: rating/agent_id aceitam nulo; status, send_at,
--      responded_at, conversation_id e message_text gravam; nota fora de 1..5 e
--      'responded' sem carimbo são recusados; conversation_id duplicado é recusado;
--      csat_surveys não tem gatilho (o backfill da migration não reescreve data);
--   2) claim_due_csat_surveys: só o devido (send_at <= now()) sai; consentimento
--      'revoked' e contato apagado NÃO saem (viram 'failed'); o cooldown de 30 dias
--      conta CONVITES entregues e barra o 2º convite do mesmo contato; claim repetido
--      devolve 0 (a linha já saiu como 'sent'); o lote traz telefone e mensagem;
--   3) fn_capture_csat_replies: resposta entrante "5" na janela de 72 h grava nota,
--      responded_at e status 'responded' na mesma transação; "6"/"ok", mensagem do
--      agente, mensagem apagada, resposta depois de 72 h e contato sem convite aberto
--      NÃO gravam; a 3ª rodada captura 0 (idempotente);
--   4) permissão: service_role executa as duas RPCs; anon e authenticated são negados
--      (EXECUTE e tentativa real); as duas têm search_path fixo; a policy de leitura
--      por agente/admin continua valendo (agente vê a própria, não a do colega);
--      o job pg_cron 'csat-reply-capture-tick' existe e chama a função qualificada;
--   5) o rollback da migration executa (em savepoint) e desfaz colunas, os 3 índices, RPCs e policy.
--
-- COMO RODA (banco LOCAL do cartão, nunca produção):
--   zapp-db-local psql . csat_pipeline < supabase/tests/csat_pipeline.sql
-- Roda como postgres, troca para service_role/anon/authenticated (SET LOCAL ROLE)
-- e termina em ROLLBACK: nenhuma fixture fica no banco. Sem a migration aplicada o
-- teste FALHA já na 1ª chamada (coluna/função inexistente).
--
-- LIMITAÇÃO: a autorização é provada por ACL do Postgres (has_function_privilege +
-- SET ROLE real) e pela lógica da policy com auth.uid() via request.jwt.claims —
-- não pelo caminho JWT/PostgREST.

\set ON_ERROR_STOP on

BEGIN;

-- ============================ fixtures ============================
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES ('a1000000-0000-0000-0000-000000000001') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (id) VALUES ('a1000000-0000-0000-0000-000000000002') ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = origin;

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Agente A CSAT'),
  ('a0000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'Agente B CSAT');

INSERT INTO public.contacts (id, name, phone, conversation_status, consent_status) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Contato Ok',        '5511900000001', 'open', 'granted'),
  ('c0000000-0000-0000-0000-000000000002', 'Contato Revogado',  '5511900000002', 'open', 'revoked'),
  ('c0000000-0000-0000-0000-000000000003', 'Contato Apagado',   '5511900000003', 'open', 'granted'),
  ('c0000000-0000-0000-0000-000000000004', 'Contato Cooldown',  '5511900000004', 'open', 'granted'),
  ('c0000000-0000-0000-0000-000000000005', 'Contato Antigo',    '5511900000005', 'open', 'granted'),
  ('c0000000-0000-0000-0000-000000000006', 'Contato Futuro',    '5511900000006', 'open', 'granted'),
  ('c0000000-0000-0000-0000-000000000007', 'Contato Sem Convite','5511900000007', 'open', 'granted'),
  ('c0000000-0000-0000-0000-000000000008', 'Contato Vencido',   '5511900000008', 'open', 'granted');

UPDATE public.contacts SET deleted_at = now() WHERE id = 'c0000000-0000-0000-0000-000000000003';

-- convite entregue ontem (cooldown ativo) e convite entregue há 40 dias (cooldown expirado)
INSERT INTO public.csat_surveys (id, contact_id, agent_id, rating, status, send_at, conversation_id, created_at) VALUES
  ('d0000000-0000-0000-0000-000000000090', 'c0000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000001', NULL, 'sent',
   now() - interval '1 day', 'e0000000-0000-0000-0000-000000000090', now() - interval '1 day'),
  ('d0000000-0000-0000-0000-000000000091', 'c0000000-0000-0000-0000-000000000005',
   'a0000000-0000-0000-0000-000000000001', NULL, 'sent',
   now() - interval '40 days', 'e0000000-0000-0000-0000-000000000091', now() - interval '40 days');

-- ==================== T1: colunas, constraints e índice ====================
DO $$
DECLARE
  v_n        integer;
  v_faltando text;
BEGIN
  SELECT count(*) INTO v_n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'csat_surveys'
     AND column_name IN ('status', 'send_at', 'responded_at', 'conversation_id', 'message_text');
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'T1 FALHOU: só % das 5 colunas do ciclo existem', v_n;
  END IF;

  SELECT string_agg(column_name, ', ') INTO v_faltando
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'csat_surveys'
     AND column_name IN ('rating', 'agent_id') AND is_nullable = 'NO';
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'T1 FALHOU: coluna(s) ainda NOT NULL: %', v_faltando;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'csat_surveys'
                AND column_name = 'status' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'T1 FALHOU: status sem default';
  END IF;

  -- a migration supõe csat_surveys sem gatilho (o backfill não pode reescrever data)
  SELECT count(*) INTO v_n
    FROM pg_trigger
   WHERE tgrelid = 'public.csat_surveys'::regclass AND NOT tgisinternal;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: csat_surveys tem % gatilho(s); o backfill do updated_at não é seguro', v_n;
  END IF;

  -- nota 0 e 6 recusadas
  BEGIN
    INSERT INTO public.csat_surveys (id, contact_id, rating, status, responded_at)
    VALUES ('d0000000-0000-0000-0000-0000000000f1', 'c0000000-0000-0000-0000-000000000001', 0, 'responded', now());
    RAISE EXCEPTION 'T1 FALHOU: nota 0 foi aceita';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.csat_surveys (id, contact_id, rating, status, responded_at)
    VALUES ('d0000000-0000-0000-0000-0000000000f2', 'c0000000-0000-0000-0000-000000000001', 6, 'responded', now());
    RAISE EXCEPTION 'T1 FALHOU: nota 6 foi aceita';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 'responded' exige responded_at
  BEGIN
    INSERT INTO public.csat_surveys (id, contact_id, rating, status)
    VALUES ('d0000000-0000-0000-0000-0000000000f3', 'c0000000-0000-0000-0000-000000000001', 5, 'responded');
    RAISE EXCEPTION 'T1 FALHOU: responded sem responded_at foi aceito';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- convite: rating e agent_id nulos, status scheduled
  INSERT INTO public.csat_surveys (id, contact_id, agent_id, rating, status, send_at, conversation_id, message_text)
  VALUES ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', NULL, NULL,
          'scheduled', now() - interval '2 hours', 'e0000000-0000-0000-0000-000000000001',
          'Como foi o atendimento? Responda de 1 a 5.');

  -- conversation_id duplicado é recusado (índice único parcial)
  BEGIN
    INSERT INTO public.csat_surveys (id, contact_id, rating, status, send_at, conversation_id)
    VALUES ('d0000000-0000-0000-0000-0000000000f4', 'c0000000-0000-0000-0000-000000000007', NULL,
            'scheduled', now(), 'e0000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'T1 FALHOU: conversation_id duplicado foi aceito';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  RAISE NOTICE 'T1 OK: colunas do ciclo, rating/agent_id nulos, constraints, sem gatilho e conversa única';
END $$;

-- ==================== T2: claim atômico dos convites ====================
-- Determinismo: re-rodar a suite na mesma base não pode ver convite de rodada
-- anterior (o claim marca 'sent' e o cooldown conta 30 dias pela created_at).
DELETE FROM public.csat_surveys WHERE id::text LIKE 'd0000000-0000-0000-0000-00000000000%';
-- (o DELETE acima remove também o convite pronto d...0001 do T1; ele é reinserido
-- aqui com os mesmos valores para o claim continuar vendo os 2 devidos.)
INSERT INTO public.csat_surveys (id, contact_id, agent_id, rating, status, send_at, conversation_id, message_text, created_at) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', NULL, NULL, 'scheduled',
   now() - interval '2 hours', 'e0000000-0000-0000-0000-000000000001', 'Como foi o atendimento? Responda de 1 a 5.', now() - interval '2 hours'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', NULL, NULL, 'scheduled',
   now() - interval '1 minute', 'e0000000-0000-0000-0000-000000000002', 'convite revogado', now() - interval '2 days'),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', NULL, NULL, 'scheduled',
   now() - interval '1 minute', 'e0000000-0000-0000-0000-000000000003', 'convite apagado', now() - interval '2 days'),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', NULL, NULL, 'scheduled',
   now() - interval '1 minute', 'e0000000-0000-0000-0000-000000000004', 'convite em cooldown', now()),
  ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', NULL, NULL, 'scheduled',
   now() - interval '1 day', 'e0000000-0000-0000-0000-000000000005', 'convite antigo ok', now()),
  ('d0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000006', NULL, NULL, 'scheduled',
   now() + interval '1 hour',  'e0000000-0000-0000-0000-000000000006', 'convite futuro', now());

DO $$
DECLARE
  v_n    integer;
  v_lote integer;
  v_tel  text;
  v_msg  text;
  v_st   text;
BEGIN
  -- convite pronto (d...0001) + convite com cooldown expirado (d...0005) devem sair
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_lote FROM public.claim_due_csat_surveys(10);
  RESET ROLE;
  IF v_lote <> 2 THEN
    RAISE EXCEPTION 'T2 FALHOU: claim devolveu % linhas (esperado 2)', v_lote;
  END IF;

  SELECT status INTO v_st FROM public.csat_surveys WHERE id = 'd0000000-0000-0000-0000-000000000001';
  IF v_st <> 'sent' THEN RAISE EXCEPTION 'T2 FALHOU: convite pronto ficou em % (esperado sent)', v_st; END IF;

  SELECT status INTO v_st FROM public.csat_surveys WHERE id = 'd0000000-0000-0000-0000-000000000005';
  IF v_st <> 'sent' THEN RAISE EXCEPTION 'T2 FALHOU: convite com cooldown expirado ficou em %', v_st; END IF;

  -- inelegíveis viram terminais, não ficam presos na fila
  SELECT status INTO v_st FROM public.csat_surveys WHERE id = 'd0000000-0000-0000-0000-000000000002';
  IF v_st <> 'failed' THEN RAISE EXCEPTION 'T2 FALHOU: consentimento revoked ficou em % (esperado failed)', v_st; END IF;

  SELECT status INTO v_st FROM public.csat_surveys WHERE id = 'd0000000-0000-0000-0000-000000000003';
  IF v_st <> 'failed' THEN RAISE EXCEPTION 'T2 FALHOU: contato apagado ficou em % (esperado failed)', v_st; END IF;

  -- cooldown ativo e convite futuro seguem agendados
  SELECT status INTO v_st FROM public.csat_surveys WHERE id = 'd0000000-0000-0000-0000-000000000004';
  IF v_st <> 'scheduled' THEN RAISE EXCEPTION 'T2 FALHOU: convite em cooldown saiu como %', v_st; END IF;

  SELECT status INTO v_st FROM public.csat_surveys WHERE id = 'd0000000-0000-0000-0000-000000000006';
  IF v_st <> 'scheduled' THEN RAISE EXCEPTION 'T2 FALHOU: convite futuro saiu como %', v_st; END IF;

  -- o convite futuro não aparece no lote
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_n FROM public.claim_due_csat_surveys(10)
   WHERE id = 'd0000000-0000-0000-0000-000000000006';
  RESET ROLE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T2 FALHOU: convite futuro apareceu no lote'; END IF;

  -- 2ª rodada: nada novo (as linhas já saíram como sent)
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_lote FROM public.claim_due_csat_surveys(10);
  RESET ROLE;
  IF v_lote <> 0 THEN
    RAISE EXCEPTION 'T2 FALHOU: 2ª rodada devolveu % (esperado 0)', v_lote;
  END IF;

  -- dois devidos do MESMO contato: sai só um por chamada (o mais antigo)
  INSERT INTO public.csat_surveys (id, contact_id, agent_id, rating, status, send_at, conversation_id, message_text, created_at) VALUES
   ('d0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000006', NULL, NULL, 'scheduled',
    now() - interval '2 hours', 'e0000000-0000-0000-0000-000000000012', 'convite duplo A', now() - interval '2 hours'),
   ('d0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000006', NULL, NULL, 'scheduled',
    now() - interval '1 hour', 'e0000000-0000-0000-0000-000000000013', 'convite duplo B', now() - interval '1 hour');
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_lote FROM public.claim_due_csat_surveys(10);
  RESET ROLE;
  IF v_lote <> 1 THEN
    RAISE EXCEPTION 'T2 FALHOU: par do mesmo contato devolveu % (esperado 1)', v_lote;
  END IF;
  SELECT status INTO v_st FROM public.csat_surveys WHERE id = 'd0000000-0000-0000-0000-000000000012';
  IF v_st <> 'sent' THEN RAISE EXCEPTION 'T2 FALHOU: convite mais antigo do par ficou em % (esperado sent)', v_st; END IF;
  SELECT status INTO v_st FROM public.csat_surveys WHERE id = 'd0000000-0000-0000-0000-000000000013';
  IF v_st <> 'scheduled' THEN RAISE EXCEPTION 'T2 FALHOU: 2º convite do par saiu como % (esperado scheduled)', v_st; END IF;

  RAISE NOTICE 'T2 OK: claim saiu só para os devidos (2), inelegíveis viraram failed, cooldown/futuro agendados, 2ª rodada 0, par do mesmo contato sai 1';
END $$;

-- ==================== T3: captura da resposta "1..5" ====================
-- convite antigo sem resposta válida ainda; convite vencido (73 h) para o fora-de-janela
INSERT INTO public.csat_surveys (id, contact_id, agent_id, rating, status, send_at, conversation_id, message_text, created_at)
VALUES ('d0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000008', NULL, NULL, 'sent',
        now() - interval '73 hours', 'e0000000-0000-0000-0000-000000000008', 'convite vencido', now() - interval '73 hours');

INSERT INTO public.messages (id, contact_id, sender, content, message_type, created_at) VALUES
  -- resposta válida do convite d...0001 (send_at = now() - 2 h)
  ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'contact', '5',  'text', now() - interval '10 minutes'),
  -- convite d...0005: '6', 'ok', mensagem do agente e mensagem apagada não valem
  ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000005', 'contact', '6',  'text', now() - interval '9 minutes'),
  ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000005', 'contact', 'ok', 'text', now() - interval '8 minutes'),
  ('f0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000005', 'agent',   '3',  'text', now() - interval '7 minutes'),
  ('f0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', 'contact', '2',  'text', now() - interval '6 minutes'),
  -- convite vencido d...0008: resposta 73 h depois do convite (fora da janela de 72 h)
  ('f0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000008', 'contact', '4',  'text', now() - interval '30 seconds'),
  -- resposta ANTES do send_at do convite (74 h atrás, send há 73 h): nunca casa
  ('f0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000008', 'contact', '4',  'text', now() - interval '74 hours'),
  -- contato sem convite aberto
  ('f0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000007', 'contact', '3',  'text', now() - interval '4 minutes');

UPDATE public.messages SET is_deleted = true WHERE id = 'f0000000-0000-0000-0000-000000000005';

DO $$
DECLARE
  v_n        integer;
  v_rating   integer;
  v_status   text;
  v_resp     timestamptz;
  v_esperado timestamptz;
BEGIN
  -- 1ª rodada: só a resposta do convite d...0001
  SET LOCAL ROLE service_role;
  v_n := public.fn_capture_csat_replies(50);
  RESET ROLE;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T3 FALHOU: 1ª rodada capturou % (esperado 1)', v_n;
  END IF;

  SELECT rating, status, responded_at INTO v_rating, v_status, v_resp
    FROM public.csat_surveys WHERE id = 'd0000000-0000-0000-0000-000000000001';
  SELECT created_at INTO v_esperado FROM public.messages WHERE id = 'f0000000-0000-0000-0000-000000000001';
  IF v_rating <> 5 OR v_status <> 'responded' OR v_resp IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'T3 FALHOU: nota=% status=% responded_at=% (esperado 5/responded/%)', v_rating, v_status, v_resp, v_esperado;
  END IF;

  -- fora da janela de 72 h e inválidos seguem sem nota
  IF EXISTS (SELECT 1 FROM public.csat_surveys
              WHERE id IN ('d0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000008')
                AND rating IS NOT NULL) THEN
    RAISE EXCEPTION 'T3 FALHOU: nota gravada sem resposta válida (janela/inválidos)';
  END IF;

  -- agora sim uma resposta válida para o convite d...0005 (a mais antiga da janela)
  INSERT INTO public.messages (id, contact_id, sender, content, message_type, created_at)
  VALUES ('f0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000005', 'contact', '4', 'text', now() - interval '2 hours');

  SET LOCAL ROLE service_role;
  v_n := public.fn_capture_csat_replies(50);
  RESET ROLE;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T3 FALHOU: 2ª rodada capturou % (esperado 1)', v_n;
  END IF;
  SELECT rating, status INTO v_rating, v_status
    FROM public.csat_surveys WHERE id = 'd0000000-0000-0000-0000-000000000005';
  IF v_rating <> 4 OR v_status <> 'responded' THEN
    RAISE EXCEPTION 'T3 FALHOU: convite antigo nota=% status=% (esperado 4/responded)', v_rating, v_status;
  END IF;

  -- 3ª rodada: idempotente
  SET LOCAL ROLE service_role;
  v_n := public.fn_capture_csat_replies(50);
  RESET ROLE;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: 3ª rodada capturou % (esperado 0 — idempotente)', v_n;
  END IF;

  -- convite que não saiu nunca ganha nota
  IF EXISTS (SELECT 1 FROM public.csat_surveys
              WHERE id IN ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003')
                AND rating IS NOT NULL) THEN
    RAISE EXCEPTION 'T3 FALHOU: convite que não saiu ganhou nota';
  END IF;

  RAISE NOTICE 'T3 OK: nota capturada na janela, fora da janela/inválidos ignorados, idempotente';
END $$;

-- ==================== T4: permissão e policy de leitura ====================
DO $$
DECLARE
  v_n integer;
BEGIN
  -- ACL: só service_role executa
  IF has_function_privilege('anon', 'public.claim_due_csat_surveys(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T4 FALHOU: anon tem EXECUTE em claim_due_csat_surveys';
  END IF;
  IF has_function_privilege('authenticated', 'public.claim_due_csat_surveys(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T4 FALHOU: authenticated tem EXECUTE em claim_due_csat_surveys';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_due_csat_surveys(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T4 FALHOU: service_role NÃO tem EXECUTE em claim_due_csat_surveys';
  END IF;
  IF has_function_privilege('anon', 'public.fn_capture_csat_replies(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T4 FALHOU: anon tem EXECUTE em fn_capture_csat_replies';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_capture_csat_replies(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T4 FALHOU: authenticated tem EXECUTE em fn_capture_csat_replies';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.fn_capture_csat_replies(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T4 FALHOU: service_role NÃO tem EXECUTE em fn_capture_csat_replies';
  END IF;

  -- tentativa REAL como anon/authenticated
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.claim_due_csat_surveys(10);
    RAISE EXCEPTION 'T4 FALHOU: anon executou claim_due_csat_surveys';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.fn_capture_csat_replies(10);
    RAISE EXCEPTION 'T4 FALHOU: authenticated executou fn_capture_csat_replies';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- search_path fixo nas duas
  SELECT count(*) INTO v_n
    FROM pg_proc p
   WHERE p.proname IN ('claim_due_csat_surveys', 'fn_capture_csat_replies')
     AND p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp'];
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T4 FALHOU: % função(ões) sem search_path fixo', v_n;
  END IF;

  -- leitura continua como hoje: o agente vê a própria pesquisa, não a do colega
  INSERT INTO public.csat_surveys (id, contact_id, agent_id, rating, status, responded_at, send_at)
  VALUES ('d0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000001',
          'a0000000-0000-0000-0000-000000000001', 4, 'responded', now(), now());
  INSERT INTO public.csat_surveys (id, contact_id, agent_id, rating, status, responded_at, send_at)
  VALUES ('d0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000001',
          'a0000000-0000-0000-0000-000000000002', 4, 'responded', now(), now());

  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-0000-0000-000000000001')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.csat_surveys
   WHERE id IN ('d0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000010');
  RESET ROLE;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T4 FALHOU: agente enxergou % pesquisas (esperado só a própria)', v_n;
  END IF;

  -- o sistema (service_role) enxerga as duas
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_n FROM public.csat_surveys
   WHERE id IN ('d0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000010');
  RESET ROLE;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'T4 FALHOU: service_role enxergou % (esperado 2)', v_n;
  END IF;

  RAISE NOTICE 'T4 OK: anon/authenticated negados nas duas RPCs, search_path fixo, leitura por agente/admin preservada';
END $$;

-- ============ T4c: INSERT de authenticated só no formato legado ============
-- Convite agendado (scheduled + message_text) só o sistema grava; authenticated
-- grava só resposta já dada (responded + nota + carimbo). Prova com papel real.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-0000-0000-000000000001')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.csat_surveys (contact_id, agent_id, rating, status, send_at, message_text)
    VALUES ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
            NULL, 'scheduled', now(), 'texto plantado pelo agente');
    RAISE EXCEPTION 'T4c FALHOU: scheduled com message_text passou como authenticated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- formato legado continua passando
  INSERT INTO public.csat_surveys (id, contact_id, agent_id, rating, status, responded_at, send_at)
  VALUES ('d0000000-0000-0000-0000-0000000000c1', 'c0000000-0000-0000-0000-000000000001',
          'a0000000-0000-0000-0000-000000000001', 5, 'responded', now(), now());
  RESET ROLE;
  DELETE FROM public.csat_surveys WHERE id = 'd0000000-0000-0000-0000-0000000000c1';
  RAISE NOTICE 'T4c OK: authenticated não planta scheduled+texto, legado passa';
END $$;

-- ============ T4b: entrada inválida recusada (limit <= 0) ============
DO $$
DECLARE
  v_negou boolean;
BEGIN
  SET LOCAL ROLE service_role;

  v_negou := false;
  BEGIN
    PERFORM public.claim_due_csat_surveys(0);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_negou := true;
  END;
  IF NOT v_negou THEN
    RAISE EXCEPTION 'T4b FALHOU: claim_due_csat_surveys aceitou limit 0';
  END IF;

  v_negou := false;
  BEGIN
    PERFORM public.fn_capture_csat_replies(-1);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_negou := true;
  END;
  IF NOT v_negou THEN
    RAISE EXCEPTION 'T4b FALHOU: fn_capture_csat_replies aceitou limit -1';
  END IF;

  v_negou := false;
  BEGIN
    PERFORM public.fn_capture_csat_replies(NULL);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_negou := true;
  END;
  IF NOT v_negou THEN
    RAISE EXCEPTION 'T4b FALHOU: fn_capture_csat_replies aceitou limit NULL';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T4b OK: limit nulo, zero e negativo recusados com 22023';
END $$;

-- ==================== T5: job do pg_cron (modelo PE-102) ====================
DO $$
DECLARE
  v_cmd text;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'T5 PULADO: pg_cron não está instalado neste banco';
    RETURN;
  END IF;
  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 'csat-reply-capture-tick';
  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'T5 FALHOU: job csat-reply-capture-tick não foi agendado';
  END IF;
  IF v_cmd NOT LIKE '%public.fn_capture_csat_replies%' THEN
    RAISE EXCEPTION 'T5 FALHOU: comando do job não chama a função qualificada: %', v_cmd;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'csat-reply-capture-tick' AND schedule = '*/2 * * * *') THEN
    RAISE EXCEPTION 'T5 FALHOU: schedule do job não é */2 * * * *';
  END IF;
  RAISE NOTICE 'T5 OK: job csat-reply-capture-tick a cada 2 min chama public.fn_capture_csat_replies()';
END $$;

-- ==================== T6: o rollback da migration executa ====================
-- as fixtures de csat_surveys saem antes (o rollback devolve rating/agent_id a
-- NOT NULL e o banco não pode ter convite com nulo naquele momento)
DELETE FROM public.csat_surveys;

SAVEPOINT rb;

-- linhas do bloco '-- Rollback (SQL executável, na ordem)' da migration 20261016173814
DO $rb$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'csat-reply-capture-tick'; END IF; END $rb$;
DROP FUNCTION IF EXISTS public.fn_capture_csat_replies(integer);
DROP FUNCTION IF EXISTS public.claim_due_csat_surveys(integer);
DROP POLICY IF EXISTS "Service role manages CSAT surveys" ON public.csat_surveys;
DROP POLICY IF EXISTS "Users can insert CSAT surveys" ON public.csat_surveys;
CREATE POLICY "Users can insert CSAT surveys" ON public.csat_surveys FOR INSERT TO authenticated WITH CHECK (agent_id IS NULL OR agent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()));
ALTER TABLE public.csat_surveys DROP CONSTRAINT IF EXISTS csat_surveys_responded_consistency;
ALTER TABLE public.csat_surveys DROP CONSTRAINT IF EXISTS csat_surveys_rating_range;
ALTER TABLE public.csat_surveys DROP CONSTRAINT IF EXISTS csat_surveys_status_check;
DROP INDEX IF EXISTS public.uq_csat_surveys_conversation;
DROP INDEX IF EXISTS public.idx_csat_surveys_dispatch;
DROP INDEX IF EXISTS public.idx_csat_surveys_contact_invites;
ALTER TABLE public.csat_surveys DROP COLUMN IF EXISTS message_text;
ALTER TABLE public.csat_surveys DROP COLUMN IF EXISTS conversation_id;
ALTER TABLE public.csat_surveys DROP COLUMN IF EXISTS responded_at;
ALTER TABLE public.csat_surveys DROP COLUMN IF EXISTS send_at;
ALTER TABLE public.csat_surveys DROP COLUMN IF EXISTS status;
ALTER TABLE public.csat_surveys ALTER COLUMN rating SET NOT NULL;
ALTER TABLE public.csat_surveys ALTER COLUMN agent_id SET NOT NULL;

DO $$
DECLARE
  v_n integer;
  v_wc text;
BEGIN
  SELECT count(*) INTO v_n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'csat_surveys'
     AND column_name IN ('status', 'send_at', 'responded_at', 'conversation_id', 'message_text');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T6 FALHOU: rollback deixou % coluna(s) do ciclo', v_n;
  END IF;
  IF to_regprocedure('public.claim_due_csat_surveys(integer)') IS NOT NULL
     OR to_regprocedure('public.fn_capture_csat_replies(integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'T6 FALHOU: rollback deixou RPC viva';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'csat_surveys'
                AND policyname = 'Service role manages CSAT surveys') THEN
    RAISE EXCEPTION 'T6 FALHOU: rollback deixou a policy de service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes
              WHERE schemaname = 'public' AND tablename = 'csat_surveys'
                AND indexname IN ('uq_csat_surveys_conversation',
                                  'idx_csat_surveys_dispatch',
                                  'idx_csat_surveys_contact_invites')) THEN
    RAISE EXCEPTION 'T6 FALHOU: rollback deixou índice do ciclo';
  END IF;
  -- o rollback restaura o INSERT legado (sem a trava de responded)
  SELECT with_check INTO v_wc FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'csat_surveys'
     AND policyname = 'Users can insert CSAT surveys';
  IF v_wc IS NULL OR position('responded' IN v_wc) > 0 THEN
    RAISE EXCEPTION 'T6 FALHOU: rollback não restaurou o INSERT legado';
  END IF;
END $$;

ROLLBACK TO SAVEPOINT rb;

DO $$
BEGIN
  -- depois de voltar o savepoint, o ciclo está de pé de novo
  IF to_regprocedure('public.claim_due_csat_surveys(integer)') IS NULL
     OR to_regprocedure('public.fn_capture_csat_replies(integer)') IS NULL THEN
    RAISE EXCEPTION 'T6 FALHOU: as RPCs não voltaram ao desfazer o savepoint';
  END IF;
  RAISE NOTICE 'T6 OK: o rollback da migration executa e desfaz colunas/RPCs/policies/índices, restaurando o INSERT legado';
END $$;

DO $$ BEGIN
  RAISE NOTICE 'csat_pipeline: suite OK (ciclo convite->envio->nota, ACL service_role, cron, rollback)';
END $$;

ROLLBACK;
