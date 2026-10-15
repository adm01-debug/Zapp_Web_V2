-- ============================================================================
-- chatbot_flows_ai_l1 — o fluxo de chatbot de IA (L1) e aceito pelo banco e unico
-- por conexao (cartao t_a7e099e7)
--
-- DEFEITO QUE ESTE TESTE TRAVA: o CHECK inline de public.chatbot_flows (criado em
-- 20260315151618_8e3fca18-74ac-4877-84f4-d2a02cfaf24f.sql:46) so aceitava
-- keyword/first_message/menu/webhook/schedule. A UI do Chatbot IA grava
-- trigger_type = 'ai_l1' (src/components/settings/ChatbotL1Config.tsx:88): a primeira
-- gravacao falha com 23514. Alem disso, nada impedia DOIS fluxos 'ai_l1' ativos na
-- mesma conexao, e a Edge supabase/functions/chatbot-l1/index.ts:87-94 le o fluxo pela
-- conexao com maybeSingle() — com duas linhas ela estoura.
--
-- O QUE PROVA (criterio de pronto do cartao), na ordem de execucao:
--   T0 VERMELHO — pre-estado do defeito recriado (CHECK antigo sem 'ai_l1' e indice
--      ausente): INSERT de 'ai_l1' negado (23514). E a assercao que o defeito derruba.
--   T1 VERDE — a MIGRATION REAL e aplicada VERBATIM com \i e o INSERT de 'ai_l1' passa;
--      o indice unico parcial passa a existir.
--   T2 NEGACAO — 2o fluxo 'ai_l1' ATIVO na MESMA conexao negado (23505), por INSERT.
--   T3 PASSA — 'ai_l1' INATIVO (false) e 'ai_l1' com is_active NULL na mesma conexao
--      continuam aceitos: o indice e parcial (is_active IS TRUE).
--   T4 PASSA — 'ai_l1' ativo em OUTRA conexao aceito (a unicidade e por conexao).
--   T5 NEGACAO — virar o inativo de T3 para ativo por UPDATE na conexao ocupada
--      tambem negado (23505): nao adianta burlar por UPDATE.
--   T6 PASSA — 'ai_l1' ativo SEM whatsapp_connection_id (o fluxo que a UI cria) aceito.
--   T7 ESTRUTURA — o indice existe, e UNICO e PARCIAL com o predicado exigido.
--   T8 ROLLBACK executavel — as 7 linhas do cabecalho da migration rodam: o indice cai,
--      os 'ai_l1' ficam DESLIGADOS/reclassificados SEM reescrever updated_at (gatilho BEFORE
--      UPDATE desligado na transacao) e o CHECK antigo volta (INSERT de 'ai_l1' → 23514).
--
-- PAPEL REAL: as assercoes rodam com SET LOCAL ROLE service_role (BYPASSRLS) — o alvo
-- aqui e a CONSTRAINT e o INDICE, que valem para todos os papeis; nao se prova RLS aqui.
--
-- ZERO EFEITO COLATERAL: tudo numa transacao que termina em ROLLBACK.
--
-- COMO RODA (a partir da RAIZ do repositorio, contra o banco local da tarefa):
--   zapp-db-local psql . <copia> < supabase/tests/chatbot_flows_ai_l1.sql
-- (o caminho da migration pode ser passado adiante com  -v mig=<caminho absoluto>)
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig}
\else
\set mig supabase/migrations/20261015211127_chatbot_flows_ai_l1.sql
\endif

BEGIN;

-- fixtures (papel dono da tabela): duas conexoes com id deterministico ----------------
INSERT INTO public.whatsapp_connections (id, name, phone_number)
VALUES ('a0000000-0000-4000-8000-0000000000a1', 'prova-ai-l1-conn-a', '+5500000000101');
INSERT INTO public.whatsapp_connections (id, name, phone_number)
VALUES ('b0000000-0000-4000-8000-0000000000b1', 'prova-ai-l1-conn-b', '+5500000000102');

-- T0 — PRE-ESTADO DO DEFEITO (vermelho) ----------------------------------------------
\echo 'T0: com o CHECK antigo e sem o indice, INSERT de ai_l1 e negado (23514)'
DROP INDEX IF EXISTS public.chatbot_flows_ai_l1_one_active_idx;
ALTER TABLE public.chatbot_flows DROP CONSTRAINT IF EXISTS chatbot_flows_trigger_type_check;
ALTER TABLE public.chatbot_flows
  ADD CONSTRAINT chatbot_flows_trigger_type_check
  CHECK (trigger_type IN ('keyword', 'first_message', 'menu', 'webhook', 'schedule'));
DO $$
DECLARE v_conn uuid := 'a0000000-0000-4000-8000-0000000000a1';
BEGIN
  BEGIN
    INSERT INTO public.chatbot_flows (name, is_active, trigger_type, whatsapp_connection_id)
    VALUES ('prova-pre-ai-l1', true, 'ai_l1', v_conn);
    RAISE EXCEPTION 'T0 FALHOU: o CHECK antigo aceitou ai_l1 (o defeito nao foi reproduzido)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'T0 OK (vermelho): ai_l1 negado pelo CHECK antigo (23514)';
  END;
END $$;

-- T1 — VERDE: aplica a MIGRATION REAL e o INSERT de ai_l1 passa ---------------------
\echo 'T1: aplicando a migration real (\i :mig), ai_l1 passa e o indice existe'
\i :mig
SET LOCAL ROLE service_role;
DO $$
DECLARE v_conn uuid := 'a0000000-0000-4000-8000-0000000000a1';
BEGIN
  INSERT INTO public.chatbot_flows (name, is_active, trigger_type, whatsapp_connection_id)
  VALUES ('prova-ai-l1-ativo-a', true, 'ai_l1', v_conn);
  PERFORM 1 FROM pg_class WHERE relname = 'chatbot_flows_ai_l1_one_active_idx';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'T1 FALHOU: a migration nao criou o indice unico parcial';
  END IF;
  RAISE NOTICE 'T1 OK: ai_l1 aceito e indice criado';
END $$;

-- T2 — NEGACAO: 2o ativo na mesma conexao (23505) ------------------------------------
\echo 'T2: service_role NAO cria um 2o ai_l1 ATIVO na mesma conexao (23505)'
DO $$
DECLARE v_conn uuid := 'a0000000-0000-4000-8000-0000000000a1';
BEGIN
  BEGIN
    INSERT INTO public.chatbot_flows (name, is_active, trigger_type, whatsapp_connection_id)
    VALUES ('prova-ai-l1-ativo-a2', true, 'ai_l1', v_conn);
    RAISE EXCEPTION 'T2 FALHOU: 2o ai_l1 ativo na mesma conexao foi aceito';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'T2 OK: 2o ai_l1 ativo na mesma conexao negado (23505)';
  END;
END $$;

-- T3 — PASSA: inativo (false) e NULL nao contam como ativo --------------------------
\echo 'T3: ai_l1 INATIVO e ai_l1 com is_active NULL na mesma conexao sao aceitos'
DO $$
DECLARE v_conn uuid := 'a0000000-0000-4000-8000-0000000000a1'; v_n int;
BEGIN
  INSERT INTO public.chatbot_flows (name, is_active, trigger_type, whatsapp_connection_id)
  VALUES ('prova-ai-l1-inativo-a', false, 'ai_l1', v_conn);
  INSERT INTO public.chatbot_flows (name, is_active, trigger_type, whatsapp_connection_id)
  VALUES ('prova-ai-l1-nulo-a', NULL, 'ai_l1', v_conn);
  SELECT count(*) INTO v_n FROM public.chatbot_flows
   WHERE trigger_type = 'ai_l1' AND whatsapp_connection_id = v_conn AND is_active IS NOT TRUE;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'T3 FALHOU: esperava 2 fluxos ai_l1 nao-ativos na conexao, achei %', v_n;
  END IF;
  RAISE NOTICE 'T3 OK: inativo e NULL aceitos (indice e parcial)';
END $$;

-- T4 — PASSA: outra conexao ---------------------------------------------------------
\echo 'T4: ai_l1 ativo em OUTRA conexao e aceito'
DO $$
DECLARE v_b uuid := 'b0000000-0000-4000-8000-0000000000b1';
BEGIN
  INSERT INTO public.chatbot_flows (name, is_active, trigger_type, whatsapp_connection_id)
  VALUES ('prova-ai-l1-ativo-b', true, 'ai_l1', v_b);
  RAISE NOTICE 'T4 OK: ai_l1 ativo em outra conexao aceito (unicidade e por conexao)';
END $$;

-- T5 — NEGACAO por UPDATE ----------------------------------------------------------
\echo 'T5: service_role NAO ativa por UPDATE o 2o ai_l1 da conexao ocupada (23505)'
DO $$
BEGIN
  BEGIN
    UPDATE public.chatbot_flows SET is_active = true WHERE name = 'prova-ai-l1-inativo-a';
    RAISE EXCEPTION 'T5 FALHOU: virar o 2o ai_l1 da conexao para ativo por UPDATE foi aceito';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'T5 OK: ativacao por UPDATE negada (23505)';
  END;
END $$;

-- T6 — PASSA: ai_l1 ativo SEM conexao (o fluxo que a UI cria) ------------------------
\echo 'T6: ai_l1 ativo SEM whatsapp_connection_id (fluxo da UI) e aceito'
DO $$
BEGIN
  INSERT INTO public.chatbot_flows (name, is_active, trigger_type, trigger_value)
  VALUES ('prova-ai-l1-sem-conexao', true, 'ai_l1', 'auto');
  RAISE NOTICE 'T6 OK: ai_l1 ativo sem conexao aceito';
END $$;
RESET ROLE;

-- Setup do T8 (papel dono): carimba um updated_at CONHECIDO nos fluxos de prova, com o gatilho
-- desligado so nesta hora, para o valor nao virar now(). Sem isso o T8 seria tautologico:
-- INSERT e UPDATE na MESMA transacao veem o mesmo now(), e a comparacao passaria mesmo com o
-- gatilho ligado durante o rollback.
ALTER TABLE public.chatbot_flows DISABLE TRIGGER update_chatbot_flows_updated_at;
UPDATE public.chatbot_flows
   SET updated_at = timestamptz '2020-01-01 00:00:00+00'
 WHERE name LIKE 'prova-ai-l1-%';
ALTER TABLE public.chatbot_flows ENABLE TRIGGER update_chatbot_flows_updated_at;

-- T7 — ESTRUTURA -------------------------------------------------------------------
\echo 'T7: indice UNICO e PARCIAL com o predicado exigido'
DO $$
DECLARE v_uniq boolean; v_def text;
BEGIN
  SELECT i.indisunique, pg_get_indexdef(i.indexrelid)
    INTO v_uniq, v_def
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname = 'chatbot_flows_ai_l1_one_active_idx';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'T7 FALHOU: indice chatbot_flows_ai_l1_one_active_idx ausente';
  END IF;
  IF NOT v_uniq THEN
    RAISE EXCEPTION 'T7 FALHOU: indice existe mas NAO e unico: %', v_def;
  END IF;
  IF v_def NOT ILIKE '%ai_l1%' OR v_def NOT ILIKE '%is_active%'
     OR v_def NOT ILIKE '%whatsapp_connection_id%' THEN
    RAISE EXCEPTION 'T7 FALHOU: predicado do indice nao cobre ai_l1/is_active/conexao: %', v_def;
  END IF;
  RAISE NOTICE 'T7 OK: %', v_def;
END $$;

-- T8 — ROLLBACK executavel ----------------------------------------------------------
\echo 'T8: as 7 linhas do cabecalho da migration rodam, o CHECK antigo volta e o updated_at NAO e reescrito'
CREATE TEMP TABLE t_antes AS
  SELECT name, updated_at FROM public.chatbot_flows WHERE name LIKE 'prova-ai-l1-%';
DROP INDEX IF EXISTS public.chatbot_flows_ai_l1_one_active_idx;
ALTER TABLE public.chatbot_flows DISABLE TRIGGER update_chatbot_flows_updated_at;
UPDATE public.chatbot_flows SET is_active = false WHERE trigger_type = 'ai_l1';
UPDATE public.chatbot_flows SET trigger_type = 'keyword' WHERE trigger_type = 'ai_l1';
ALTER TABLE public.chatbot_flows DROP CONSTRAINT IF EXISTS chatbot_flows_trigger_type_check;
ALTER TABLE public.chatbot_flows
  ADD CONSTRAINT chatbot_flows_trigger_type_check
  CHECK (trigger_type IN ('keyword', 'first_message', 'menu', 'webhook', 'schedule'));
ALTER TABLE public.chatbot_flows ENABLE TRIGGER update_chatbot_flows_updated_at;
DO $$
DECLARE v_idx int; v_sobrou int; v_reescrito int;
BEGIN
  SELECT count(*) INTO v_idx FROM pg_class WHERE relname = 'chatbot_flows_ai_l1_one_active_idx';
  IF v_idx <> 0 THEN
    RAISE EXCEPTION 'T8 FALHOU: o indice sobreviveu ao rollback';
  END IF;
  SELECT count(*) INTO v_sobrou FROM public.chatbot_flows
   WHERE name LIKE 'prova-ai-l1-%' AND is_active IS TRUE;
  IF v_sobrou <> 0 THEN
    RAISE EXCEPTION 'T8 FALHOU: % fluxo(s) de prova continuam ATIVOS apos o rollback', v_sobrou;
  END IF;
  -- o gatilho BEFORE UPDATE regrava updated_at em toda linha tocada: desligado na transacao,
  -- o rollback NAO pode mexer no carimbo dos fluxos (recusa real de 06/10).
  SELECT count(*) INTO v_reescrito
    FROM public.chatbot_flows f JOIN t_antes a USING (name)
   WHERE f.updated_at IS DISTINCT FROM a.updated_at;
  IF v_reescrito <> 0 THEN
    RAISE EXCEPTION 'T8 FALHOU: o rollback reescreveu updated_at de % linha(s)', v_reescrito;
  END IF;
  BEGIN
    INSERT INTO public.chatbot_flows (name, is_active, trigger_type)
    VALUES ('prova-pos-rollback', true, 'ai_l1');
    RAISE EXCEPTION 'T8 FALHOU: apos o rollback o CHECK ainda aceita ai_l1';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'T8 OK: indice caiu, ai_l1 desligado, updated_at preservado em % linha(s) e CHECK antigo restaurado (23514)',
      (SELECT count(*) FROM t_antes);
  END;
END $$;

ROLLBACK;
\echo 'SUITE VERDE: chatbot_flows_ai_l1'
