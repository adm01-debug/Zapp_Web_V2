-- messages_transcribed_at — prova do carimbo da transcrição (cartão t_eddb4b16 / HZ3-007).
--
-- O QUE PROVA (critério do cartão):
--   T0  estrutura: transcribed_at é timestamptz NULL sem default (linha antiga lê NULL,
--       sem rewrite) e o gatilho é BEFORE UPDATE FOR EACH ROW, com search_path fixo;
--   T1  o BACKFILL carimbou a mensagem 'completed' sem carimbo DENTRO da janela de 30
--       dias com o updated_at que a linha já tinha, e NÃO reescreveu updated_at (é o
--       gatilho update_messages_updated_at sendo desligado só durante o backfill);
--   T2  o backfill NÃO tocou mensagem fora da janela (histórico antigo fica sem carimbo);
--   T3  mensagem em 'processing'/'failed' não nasce carimbada;
--   T4  a transição para 'completed' carimba UMA vez, na hora do UPDATE;
--   T5  UPDATE posterior (leitura, status de entrega, edição) não mexe no carimbo — era
--       disso que o aviso do hook dependia do REPLICA IDENTITY FULL — e o gatilho de
--       updated_at voltou a funcionar depois do backfill;
--   T6  setar 'completed' de novo (já carimbada) não re-carimba, e 'failed' -> 'completed'
--       carimba normalmente;
--   T7  papéis reais: service_role (escritor da Edge) carimba; authenticated atualiza a
--       leitura e PASSA sem carimbar; anon é NEGADO na tabela (42501);
--   T8  a função do gatilho não é executável por anon/authenticated (42501).
--
-- COMO RODA (Postgres 17 DESCARTÁVEL, nunca produção). A superfície mínima do Supabase é
-- criada à mão aqui (papéis anon/authenticated/service_role, public.messages, o gatilho
-- REAL de updated_at), e a migration sob teste é aplicada com \i, como r2_db_022:
--   docker run --rm -d --name zapp-v2-transc-$$ -v "$PWD:/repo:ro" \
--     -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-transc-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/supabase/migrations/20261016030211_messages_transcribed_at.sql \
--     < supabase/tests/messages_transcribed_at.sql
--   docker stop zapp-v2-transc-$$
-- Termina em ROLLBACK (fixtures e coluna não ficam). VERMELHO esperado sem a migration:
-- o mesmo comando com -v sem_migration=1 falha já em T0 (coluna ausente).

\set ON_ERROR_STOP on

-- Caminho do arquivo da migration sob teste: -v mig=<caminho> vence o padrão.
\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261016030211_messages_transcribed_at.sql'
  \endif
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão, na forma ANTERIOR à migration (sem a coluna e sem o
-- gatilho do carimbo; com o gatilho REAL de updated_at, que o backfill desliga).
-- ---------------------------------------------------------------------------
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id          uuid,
  sender              text,
  content             text,
  message_type        text,
  is_read             boolean,
  status              text,
  transcription       text,
  transcription_status text DEFAULT 'pending',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Definição REAL (20251215024517_1c312256): BEFORE UPDATE escrevendo now() em updated_at.
CREATE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER update_messages_updated_at
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- O papel real de cada um: authenticated escreve (o cliente atualiza leitura/entrega),
-- service_role escreve (a Edge grava a transcrição) e anon NÃO atualiza a tabela.
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated, service_role;
GRANT SELECT ON public.messages TO anon;

-- Histórico: uma 'completed' na janela do backfill, uma fora dela, e as que nunca
-- chegaram a completed.
INSERT INTO public.messages
  (id, contact_id, sender, content, message_type, is_read, status,
   transcription_status, created_at, updated_at) VALUES
  ('b0000000-0000-0000-0000-000000000001', NULL, 'contact', 'legada na janela', 'audio', NULL, 'delivered',
   'completed',  now() - interval '10 days', now() - interval '9 days'),
  ('b0000000-0000-0000-0000-000000000002', NULL, 'contact', 'legada fora da janela', 'audio', NULL, 'delivered',
   'completed',  now() - interval '400 days', now() - interval '399 days'),
  ('b0000000-0000-0000-0000-000000000003', NULL, 'contact', 'processando', 'audio', NULL, 'delivered',
   'processing', now() - interval '2 hours', now() - interval '2 hours'),
  ('b0000000-0000-0000-0000-000000000004', NULL, 'contact', 'falhou', 'audio', NULL, 'delivered',
   'failed',     now() - interval '1 hour',  now() - interval '1 hour');

-- ---------------------------------------------------------------------------
-- A migration SOB TESTE (real, o arquivo do repositório).
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
\else
  \i :mig
\endif

-- ---------------------------------------------------------------------------
-- T0 — estrutura da coluna e do gatilho
-- ---------------------------------------------------------------------------
DO $t0$
DECLARE
  v_estado text;
  v_tgtype integer;
BEGIN
  SELECT is_nullable || '|' || coalesce(column_default, 'SEM_DEFAULT') || '|' || data_type
    INTO v_estado
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'transcribed_at';
  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'T0 FALHOU: a coluna public.messages.transcribed_at nao existe';
  END IF;
  IF v_estado <> 'YES|SEM_DEFAULT|timestamp with time zone' THEN
    RAISE EXCEPTION 'T0 FALHOU: esperava nullable/sem default/timestamptz e veio %', v_estado;
  END IF;

  SELECT tgtype INTO v_tgtype
    FROM pg_trigger
   WHERE tgrelid = 'public.messages'::regclass
     AND tgname = 'trg_messages_stamp_transcribed_at'
     AND NOT tgisinternal;
  IF v_tgtype IS NULL THEN
    RAISE EXCEPTION 'T0 FALHOU: o gatilho trg_messages_stamp_transcribed_at nao existe';
  END IF;
  -- bits: 1=FOR EACH ROW, 2=BEFORE, 4=INSERT, 16=UPDATE
  IF (v_tgtype & 1) <> 1 OR (v_tgtype & 2) <> 2 OR (v_tgtype & 16) <> 16 OR (v_tgtype & 4) <> 0 THEN
    RAISE EXCEPTION 'T0 FALHOU: gatilho deveria ser BEFORE UPDATE FOR EACH ROW (tgtype=%)', v_tgtype;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.stamp_message_transcribed_at()'::regprocedure
       AND array_to_string(p.proconfig, ',') LIKE 'search_path=public%'
  ) THEN
    RAISE EXCEPTION 'T0 FALHOU: a funcao do carimbo nao esta com search_path fixo';
  END IF;

  -- o gatilho de updated_at, que o backfill desliga, precisa terminar LIGADO
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.messages'::regclass
       AND tgname = 'update_messages_updated_at' AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'T0 FALHOU: update_messages_updated_at ficou desligado depois da migration';
  END IF;
  RAISE NOTICE 'T0 ok: coluna nullable/sem default/timestamptz + gatilho BEFORE UPDATE FOR EACH ROW';
END
$t0$;

-- ---------------------------------------------------------------------------
-- T1/T2 — backfill: dentro da janela carimba preservando updated_at; fora, não toca
-- ---------------------------------------------------------------------------
DO $t12$
DECLARE
  v_row public.messages%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.messages WHERE id = 'b0000000-0000-0000-0000-000000000001';
  IF v_row.transcribed_at IS NULL THEN
    RAISE EXCEPTION 'T1 FALHOU: o backfill nao carimbou a mensagem completed da janela de 30 dias';
  END IF;
  IF v_row.transcribed_at IS DISTINCT FROM v_row.updated_at THEN
    RAISE EXCEPTION 'T1 FALHOU: o carimbo (%) deveria ser o updated_at que a linha ja tinha (%)',
      v_row.transcribed_at, v_row.updated_at;
  END IF;
  IF v_row.updated_at > now() - interval '1 day' THEN
    RAISE EXCEPTION 'T1 FALHOU: o backfill reescreveu updated_at (%)', v_row.updated_at;
  END IF;
  IF v_row.status IS DISTINCT FROM 'delivered' OR v_row.content IS DISTINCT FROM 'legada na janela' THEN
    RAISE EXCEPTION 'T1 FALHOU: o backfill mexeu em outra coluna da linha';
  END IF;

  SELECT * INTO v_row FROM public.messages WHERE id = 'b0000000-0000-0000-0000-000000000002';
  IF v_row.transcribed_at IS NOT NULL THEN
    RAISE EXCEPTION 'T2 FALHOU: o backfill carimbou mensagem fora da janela de 30 dias (%)', v_row.transcribed_at;
  END IF;
  RAISE NOTICE 'T1/T2 ok: backfill carimbou a da janela com o updated_at preservado e ignorou a antiga';
END
$t12$;

-- ---------------------------------------------------------------------------
-- T3 — nem 'processing' nem 'failed' nascem carimbadas
-- ---------------------------------------------------------------------------
DO $t3$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.messages
   WHERE id IN ('b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000004')
     AND transcribed_at IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: % mensagem(ns) em processing/failed nasceram carimbadas', v_n;
  END IF;
  RAISE NOTICE 'T3 ok: processing/failed seguem sem carimbo';
END
$t3$;

-- ---------------------------------------------------------------------------
-- T4/T5/T6 — transição carimba uma vez; UPDATE posterior não altera; não re-carimba
-- ---------------------------------------------------------------------------
DO $t456$
DECLARE
  v_carimbo   timestamptz;
  v_c2        timestamptz;
  v_upd_antes timestamptz;
  v_upd_depois timestamptz;
  v_msg       uuid := 'b0000000-0000-0000-0000-000000000003';
  v_falha     uuid := 'b0000000-0000-0000-0000-000000000004';
BEGIN
  SELECT updated_at INTO v_upd_antes FROM public.messages WHERE id = v_msg;

  UPDATE public.messages
     SET transcription_status = 'completed', transcription = 'texto transcrito'
   WHERE id = v_msg;
  SELECT transcribed_at INTO v_carimbo FROM public.messages WHERE id = v_msg;
  IF v_carimbo IS NULL THEN
    RAISE EXCEPTION 'T4 FALHOU: a transicao para completed nao carimbou transcribed_at';
  END IF;
  -- o carimbo e o instante da propria transacao (now() dentro do gatilho), nao o
  -- relogio do navegador nem um horario vindo de fora
  IF v_carimbo IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'T4 FALHOU: carimbo % diferente do instante da transacao %', v_carimbo, now();
  END IF;

  UPDATE public.messages
     SET is_read = true, status = 'read', content = 'conteudo editado depois'
   WHERE id = v_msg;
  SELECT transcribed_at, updated_at INTO v_c2, v_upd_depois FROM public.messages WHERE id = v_msg;
  IF v_c2 IS DISTINCT FROM v_carimbo THEN
    RAISE EXCEPTION 'T5 FALHOU: UPDATE posterior mexeu no carimbo (% -> %)', v_carimbo, v_c2;
  END IF;
  IF v_upd_depois IS NOT DISTINCT FROM v_upd_antes THEN
    RAISE EXCEPTION 'T5 FALHOU: a fixture nao chegou a ser atualizada (o UPDATE nao afetou a linha)';
  END IF;

  UPDATE public.messages SET transcription_status = 'completed' WHERE id = v_msg;
  SELECT transcribed_at INTO v_c2 FROM public.messages WHERE id = v_msg;
  IF v_c2 IS DISTINCT FROM v_carimbo THEN
    RAISE EXCEPTION 'T6 FALHOU: o carimbo foi reescrito ao setar completed de novo (% -> %)', v_carimbo, v_c2;
  END IF;

  UPDATE public.messages SET transcription_status = 'completed' WHERE id = v_falha;
  IF (SELECT transcribed_at FROM public.messages WHERE id = v_falha) IS NULL THEN
    RAISE EXCEPTION 'T6 FALHOU: failed -> completed deveria carimbar';
  END IF;
  RAISE NOTICE 'T4/T5/T6 ok: transicao carimba uma vez, UPDATE posterior nao altera, completed repetido nao re-carimba';
END
$t456$;

-- ---------------------------------------------------------------------------
-- T7 — papéis reais: service_role carimba; authenticated não é barrado; anon é negado
-- ---------------------------------------------------------------------------
DO $t7$
DECLARE
  v_msg    uuid := 'b0000000-0000-0000-0000-000000000004';
  v_nova   uuid;
  v_n      integer;
BEGIN
  INSERT INTO public.messages (id, contact_id, sender, content, message_type, transcription_status)
  VALUES ('b0000000-0000-0000-0000-000000000005', NULL, 'contact', 'transcrita pela edge', 'audio', 'pending');

  EXECUTE 'SET LOCAL ROLE service_role';
  UPDATE public.messages SET transcription_status = 'completed' WHERE id = 'b0000000-0000-0000-0000-000000000005';
  EXECUTE 'RESET ROLE';
  IF (SELECT transcribed_at FROM public.messages WHERE id = 'b0000000-0000-0000-0000-000000000005') IS NULL THEN
    RAISE EXCEPTION 'T7 FALHOU: o caminho da Edge (service_role) nao carimbou';
  END IF;

  INSERT INTO public.messages (id, contact_id, sender, content, message_type, transcription_status)
  VALUES ('b0000000-0000-0000-0000-000000000006', NULL, 'contact', 'leitura pelo cliente', 'text', 'pending')
  RETURNING id INTO v_nova;

  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.messages SET is_read = true WHERE id = v_nova;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T7 FALHOU: authenticated nao conseguiu atualizar a leitura (linhas=%)', v_n;
  END IF;
  IF (SELECT transcribed_at FROM public.messages WHERE id = v_nova) IS NOT NULL THEN
    RAISE EXCEPTION 'T7 FALHOU: o UPDATE de leitura carimbou a mensagem';
  END IF;

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    UPDATE public.messages SET is_read = true WHERE id = v_nova;
    RAISE EXCEPTION 'T7 FALHOU: anon conseguiu atualizar public.messages';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' THEN
      RAISE EXCEPTION 'T7 FALHOU: anon falhou com SQLSTATE % (esperava 42501 de permissao)', SQLSTATE;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'T7 ok: service_role carimba, authenticated atualiza sem carimbar, anon recebe 42501';
END
$t7$;

-- ---------------------------------------------------------------------------
-- T8 — a função do gatilho não é executável por anon nem por authenticated
-- ---------------------------------------------------------------------------
DO $t8$
BEGIN
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.stamp_message_transcribed_at();
    RAISE EXCEPTION 'T8 FALHOU: anon executou a funcao do carimbo';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' THEN
      RAISE EXCEPTION 'T8 FALHOU: anon falhou com SQLSTATE % (esperava 42501)', SQLSTATE;
    END IF;
  END;
  EXECUTE 'RESET ROLE';

  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.stamp_message_transcribed_at();
    RAISE EXCEPTION 'T8 FALHOU: authenticated executou a funcao do carimbo';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' THEN
      RAISE EXCEPTION 'T8 FALHOU: authenticated falhou com SQLSTATE % (esperava 42501)', SQLSTATE;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'T8 ok: anon e authenticated recebem 42501 na funcao do carimbo';
END
$t8$;

-- T9 o Rollback do cabecalho da migration executa e desfaz exatamente o que ela
--    criou, sem desligar o gatilho de updated_at que ela desligou no backfill
DO $t9$
DECLARE v_n integer := 0;
BEGIN
  drop trigger if exists trg_messages_stamp_transcribed_at on public.messages;
  drop function if exists public.stamp_message_transcribed_at();
  alter table public.messages drop column if exists transcribed_at;

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'transcribed_at';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T9 FALHOU: a coluna transcribed_at sobreviveu ao rollback'; END IF;

  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE t.tgrelid = 'public.messages'::regclass AND t.tgname = 'trg_messages_stamp_transcribed_at';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T9 FALHOU: o gatilho do carimbo sobreviveu ao rollback'; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'stamp_message_transcribed_at';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T9 FALHOU: a funcao do carimbo sobreviveu ao rollback'; END IF;

  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE t.tgrelid = 'public.messages'::regclass
     AND t.tgname = 'update_messages_updated_at' AND t.tgenabled = 'O';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T9 FALHOU: update_messages_updated_at nao ficou ligado (o backfill desliga e religa)';
  END IF;

  RAISE NOTICE 'T9 ok: o Rollback do cabecalho executa e o gatilho de updated_at segue ligado';
END
$t9$;

DO $verde$
BEGIN
  RAISE NOTICE 'messages_transcribed_at: SUITE VERDE (T0-T9)';
END
$verde$;

-- ROLLBACK do psql: a superficie minima criada a mao e as fixtures nao ficam
ROLLBACK;
