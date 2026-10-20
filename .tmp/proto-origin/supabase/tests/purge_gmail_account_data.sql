-- ============================================================================
-- purge_gmail_account_data — limpeza administrativa dos e-mails de uma conta
-- Gmail desconectada (cartao t_587bea4b, workersql).
--
-- O QUE PROVA (criterio de pronto do cartao):
--   A) ACL: EXECUTE so para `authenticated`. `anon` e `service_role` NAO executam
--      (42501 permission denied), e nao existe GRANT para PUBLIC.
--   B) Como ADMIN (authenticated + is_admin): apaga, na ORDEM filho->pai,
--      email_attachments -> email_messages -> email_threads -> email_drafts, e o
--      retorno diz QUANTAS linhas foram apagadas por tabela (`deleted`).
--   C) A linha de `gmail_accounts` NAO e apagada (a limpeza e dos e-mails) e a
--      conta vizinha, fora do alcance, fica intacta.
--   D) Recusa com o MESMO erro (22023 purge_not_allowed) para: conta ATIVA,
--      confirmacao ERRADA e conta INEXISTENTE — sem oraculo de existencia/estado.
--   E) Recusa agente comum (authenticated que nao e admin) com 42501 admin_required.
--   F) Entrada invalida (confirm NULL, id NULL) tambem recusa e nao apaga nada.
--   G) Auditoria em public.audit_logs: registrar QUEM (user_id), QUANDO
--      (created_at) e QUANTAS linhas (details->deleted) SEM o e-mail completo e
--      SEM nenhum assunto/corpo/remetente.
--   H) ATOMICIDADE: com um gatilho de prova que estoura no DELETE de
--      email_threads (depois dos filhos ja terem sido apagados dentro da mesma
--      chamada), a chamada inteira volta atras: nada fica apagado.
--   I) email_drafts nao existe nesta branch -> o ramo condicional da funcao e
--      inerte hoje (to_regclass NULL) e a funcao funciona sem a tabela.
--
-- ENFORCEMENT como PAPEL REAL: todas as chamadas passam por pg_temp.prova(), que
-- faz `SET LOCAL ROLE <papel>` + JWT sintetico em request.jwt.claims (o caminho do
-- PostgREST), nunca como postgres/superusuario — postgres ignora GRANT e RLS.
--
-- COMO RODA (banco local descartavel do proprio Zapp Web V2):
--   zapp-db-local up . v2-purgegmail          (14 min, aplica as migrations reais)
--   zapp-db-local psql . v2-purgegmail < supabase/tests/purge_gmail_account_data.sql
--
-- Tudo roda numa unica transacao que termina em ROLLBACK: idempotente, sem
-- fixture persistida e reaplicavel.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ── Fixture ─────────────────────────────────────────────────────────────────
-- auth.users sem gatilhos de aplicacao (o MESMO preparo dos outros testes de banco).
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, user_id, name) VALUES
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Admin Prova Purge'),
  ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Agente Prova Purge')
ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = origin;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-4111-8111-111111111111', 'admin'),
  ('22222222-2222-4222-8222-222222222222', 'agent')
ON CONFLICT DO NOTHING;

-- Conta A: DESCONECTADA (elegivel). Conta B: ATIVA (nao elegivel) — vizinha de prova.
INSERT INTO public.gmail_accounts (id, user_id, email_address, is_active) VALUES
  ('4a000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'conta-apagar@exemplo-teste.test', false),
  ('4a000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'conta-ativa@exemplo-teste.test',  true);

INSERT INTO public.email_threads (id, gmail_account_id, gmail_thread_id, subject) VALUES
  ('5b000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-000000000001', 'gthread-apagar-1', 'Assunto secreto da conta a apagar'),
  ('5b000000-0000-4000-8000-000000000002', '4a000000-0000-4000-8000-000000000002', 'gthread-ativa-1',  'Assunto da conta ativa');

INSERT INTO public.email_messages (id, thread_id, gmail_message_id, gmail_account_id, from_address, subject, body_text, body_html) VALUES
  ('6c000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', 'gmsg-apagar-1', '4a000000-0000-4000-8000-000000000001', 'remetente@exemplo-teste.test', 'Assunto secreto da conta a apagar', 'corpo reservado da conta a apagar 1', '<p>corpo reservado da conta a apagar 1</p>'),
  ('6c000000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000001', 'gmsg-apagar-2', '4a000000-0000-4000-8000-000000000001', 'remetente@exemplo-teste.test', 'Assunto secreto da conta a apagar', 'corpo reservado da conta a apagar 2', '<p>corpo reservado da conta a apagar 2</p>'),
  ('6c000000-0000-4000-8000-000000000003', '5b000000-0000-4000-8000-000000000002', 'gmsg-ativa-1',  '4a000000-0000-4000-8000-000000000002', 'remetente@exemplo-teste.test', 'Assunto da conta ativa', 'corpo da conta ativa', '<p>corpo da conta ativa</p>');

INSERT INTO public.email_attachments (id, email_message_id, gmail_attachment_id, filename) VALUES
  ('7d000000-0000-4000-8000-000000000001', '6c000000-0000-4000-8000-000000000001', 'gatt-apagar-1', 'contrato.pdf'),
  ('7d000000-0000-4000-8000-000000000002', '6c000000-0000-4000-8000-000000000002', 'gatt-apagar-2', 'planilha.xlsx'),
  ('7d000000-0000-4000-8000-000000000003', '6c000000-0000-4000-8000-000000000003', 'gatt-ativa-1',  'vizinha.pdf');

-- Contagem de partida: 3 anexos, 3 mensagens, 2 threads.
DO $$
DECLARE v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM public.email_attachments;
  IF v_n <> 3 THEN RAISE EXCEPTION '[fixture] anexos esperados 3, achei %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_messages;
  IF v_n <> 3 THEN RAISE EXCEPTION '[fixture] mensagens esperadas 3, achei %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_threads;
  IF v_n <> 2 THEN RAISE EXCEPTION '[fixture] threads esperadas 2, achei %', v_n; END IF;
END $$;

-- ── Helper: chama a funcao como PAPEL REAL, com JWT sintetico ────────────────
-- Devolve o jsonb de retorno OU {"sqlstate":..,"erro":..} quando a funcao recusa.
-- Se o papel pedido nao pegar, as assercoes caem (nao ha verde por engano).
CREATE OR REPLACE FUNCTION pg_temp.prova(
  p_papel   text,
  p_uid     uuid,
  p_account uuid,
  p_confirm text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_res   jsonb;
  v_state text;
  v_msg   text;
  v_atual text;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_papel);

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', p_uid, 'role', p_papel)::text,
                     true);
  SELECT current_user INTO v_atual;
  IF v_atual <> p_papel THEN
    RAISE EXCEPTION '[prova] SET LOCAL ROLE % nao pegou (current_user=%)', p_papel, v_atual;
  END IF;

  BEGIN
    v_res := public.purge_gmail_account_data(p_account, p_confirm);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    v_res := jsonb_build_object('sqlstate', v_state, 'erro', v_msg);
  END;

  EXECUTE 'RESET ROLE';
  RETURN v_res;
END;
$$;

-- ── A) ACL: so authenticated executa ────────────────────────────────────────
DO $$
DECLARE v_acl text;
BEGIN
  IF has_function_privilege('authenticated', 'public.purge_gmail_account_data(uuid,text)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'A: authenticated deveria ter EXECUTE';
  END IF;
  IF has_function_privilege('anon', 'public.purge_gmail_account_data(uuid,text)', 'EXECUTE') IS NOT FALSE THEN
    RAISE EXCEPTION 'A: anon NAO deveria ter EXECUTE';
  END IF;
  IF has_function_privilege('service_role', 'public.purge_gmail_account_data(uuid,text)', 'EXECUTE') IS NOT FALSE THEN
    RAISE EXCEPTION 'A: service_role NAO deveria ter EXECUTE';
  END IF;

  SELECT string_agg(coalesce(g.grantee::regrole::text, 'PUBLIC') || '=' || g.privilege_type, ', ')
    INTO v_acl
    FROM aclexplode(
      (SELECT p.proacl FROM pg_proc p
        WHERE p.oid = 'public.purge_gmail_account_data(uuid,text)'::regprocedure)
    ) g
   WHERE g.grantee = 0;
  IF v_acl IS NOT NULL THEN
    RAISE EXCEPTION 'A: existe GRANT para PUBLIC (%)', v_acl;
  END IF;
  RAISE NOTICE 'A OK: EXECUTE so authenticated (PUBLIC/anon/service_role sem EXECUTE)';
END $$;

-- ── E/F) Recusas de PAPEL e de ENTRADA (o admin tambem e barrado no invalido) ─
DO $$
DECLARE
  v_anon    jsonb;
  v_service jsonb;
  v_agente  jsonb;
  v_null_c  jsonb;
  v_null_i  jsonb;
  v_n       bigint;
  v_admin   uuid := '11111111-1111-4111-8111-111111111111';
  v_ag_uid  uuid := '22222222-2222-4222-8222-222222222222';
  v_a1      uuid := '4a000000-0000-4000-8000-000000000001';
BEGIN
  -- anon: barrado pela ACL, antes de qualquer logica.
  v_anon := pg_temp.prova('anon', NULL, v_a1, 'conta-apagar@exemplo-teste.test');
  IF v_anon ->> 'sqlstate' <> '42501' THEN
    RAISE EXCEPTION 'E: anon deveria receber 42501, veio %', v_anon;
  END IF;

  -- service_role: barrado pela ACL (nenhum GRANT).
  v_service := pg_temp.prova('service_role', NULL, v_a1, 'conta-apagar@exemplo-teste.test');
  IF v_service ->> 'sqlstate' <> '42501' THEN
    RAISE EXCEPTION 'E: service_role deveria receber 42501, veio %', v_service;
  END IF;

  -- Agente comum (authenticated sem is_admin): 42501 admin_required.
  v_agente := pg_temp.prova('authenticated', v_ag_uid, v_a1, 'conta-apagar@exemplo-teste.test');
  IF v_agente ->> 'sqlstate' <> '42501' OR v_agente ->> 'erro' <> 'admin_required' THEN
    RAISE EXCEPTION 'E: agente deveria receber admin_required, veio %', v_agente;
  END IF;

  -- Entrada invalida: confirmacao NULL e id NULL.
  v_null_c := pg_temp.prova('authenticated', v_admin, v_a1, NULL);
  IF v_null_c ->> 'sqlstate' <> '22023' THEN
    RAISE EXCEPTION 'F: confirm NULL deveria recusar (22023), veio %', v_null_c;
  END IF;
  v_null_i := pg_temp.prova('authenticated', v_admin, NULL, 'conta-apagar@exemplo-teste.test');
  IF v_null_i ->> 'sqlstate' <> '22023' THEN
    RAISE EXCEPTION 'F: id NULL deveria recusar (22023), veio %', v_null_i;
  END IF;

  -- Nada foi apagado por nenhuma das recusas acima.
  SELECT count(*) INTO v_n FROM public.email_messages;
  IF v_n <> 3 THEN RAISE EXCEPTION 'E/F: mensagens intactas esperadas 3, achei %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_attachments;
  IF v_n <> 3 THEN RAISE EXCEPTION 'E/F: anexos intactos esperados 3, achei %', v_n; END IF;

  RAISE NOTICE 'E/F OK: anon=42501, service_role=42501, agente=admin_required, entrada invalida=22023 (nada apagado)';
END $$;

-- ── D) Sem oraculo: conta ATIVA x confirmacao ERRADA x conta INEXISTENTE ─────
DO $$
DECLARE
  v_ativa    jsonb;
  v_confirm  jsonb;
  v_inexiste jsonb;
  v_n        bigint;
  v_admin    uuid := '11111111-1111-4111-8111-111111111111';
  v_a1       uuid := '4a000000-0000-4000-8000-000000000001';
  v_a2       uuid := '4a000000-0000-4000-8000-000000000002';
  v_fantasma uuid := '4a000000-0000-4000-8000-00000000dead';
BEGIN
  v_ativa    := pg_temp.prova('authenticated', v_admin, v_a2, 'conta-ativa@exemplo-teste.test');
  v_confirm  := pg_temp.prova('authenticated', v_admin, v_a1, 'confirmacao-errada@exemplo-teste.test');
  v_inexiste := pg_temp.prova('authenticated', v_admin, v_fantasma, 'conta-apagar@exemplo-teste.test');

  IF v_ativa ->> 'sqlstate' <> '22023' THEN
    RAISE EXCEPTION 'D: conta ativa deveria recusar (22023), veio %', v_ativa;
  END IF;
  IF v_confirm ->> 'sqlstate' <> '22023' THEN
    RAISE EXCEPTION 'D: confirmacao errada deveria recusar (22023), veio %', v_confirm;
  END IF;
  IF v_inexiste ->> 'sqlstate' <> '22023' THEN
    RAISE EXCEPTION 'D: conta inexistente deveria recusar (22023), veio %', v_inexiste;
  END IF;

  -- MESMA resposta para os tres: nenhum oraculo de existencia/estado.
  IF v_ativa ->> 'erro' <> v_confirm ->> 'erro'
     OR v_confirm ->> 'erro' <> v_inexiste ->> 'erro' THEN
    RAISE EXCEPTION 'D: respostas diferentes (oraculo): % / % / %', v_ativa, v_confirm, v_inexiste;
  END IF;
  IF v_ativa ->> 'erro' <> 'purge_not_allowed' THEN
    RAISE EXCEPTION 'D: erro esperado purge_not_allowed, veio %', v_ativa ->> 'erro';
  END IF;

  -- A conta ativa continua com todos os e-mails dela.
  SELECT count(*) INTO v_n FROM public.email_messages WHERE gmail_account_id = v_a2;
  IF v_n <> 1 THEN RAISE EXCEPTION 'D: conta ativa perdeu mensagens (achei %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_attachments a
     JOIN public.email_messages m ON m.id = a.email_message_id
    WHERE m.gmail_account_id = v_a2;
  IF v_n <> 1 THEN RAISE EXCEPTION 'D: conta ativa perdeu anexos (achei %)', v_n; END IF;

  RAISE NOTICE 'D OK: ativa/confirmacao errada/inexistente = mesmo 22023 purge_not_allowed; conta ativa intacta';
END $$;

-- ── H) Atomicidade: falha no meio nao deixa nada apagado ────────────────────
DO $$
DECLARE
  v_res jsonb;
  v_n   bigint;
  v_adm uuid := '11111111-1111-4111-8111-111111111111';
  v_a1  uuid := '4a000000-0000-4000-8000-000000000001';
BEGIN
  -- Gatilho de prova: estoura no DELETE de email_threads, que acontece DEPOIS de
  -- anexos e mensagens dentro da mesma chamada.
  CREATE OR REPLACE FUNCTION pg_temp.estoura_no_delete() RETURNS trigger
  LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'bloqueio de prova'; END $fn$;
  CREATE TRIGGER trg_prova_atomicidade
    BEFORE DELETE ON public.email_threads
    FOR EACH ROW EXECUTE FUNCTION pg_temp.estoura_no_delete();

  v_res := pg_temp.prova('authenticated', v_adm, v_a1, 'conta-apagar@exemplo-teste.test');

  DROP TRIGGER trg_prova_atomicidade ON public.email_threads;

  IF v_res ->> 'sqlstate' IS NULL THEN
    RAISE EXCEPTION 'H: a chamada deveria ter falhado pelo gatilho, veio %', v_res;
  END IF;
  IF position('bloqueio de prova' in v_res ->> 'erro') = 0 THEN
    RAISE EXCEPTION 'H: falha inesperada (nao foi a do gatilho): %', v_res;
  END IF;

  -- Nada ficou pela metade: anexos e mensagens continuam todos.
  SELECT count(*) INTO v_n FROM public.email_attachments;
  IF v_n <> 3 THEN RAISE EXCEPTION 'H: anexos deveriam voltar atras (esperado 3, achei %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_messages;
  IF v_n <> 3 THEN RAISE EXCEPTION 'H: mensagens deveriam voltar atras (esperado 3, achei %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_threads;
  IF v_n <> 2 THEN RAISE EXCEPTION 'H: threads deveriam voltar atras (esperado 2, achei %)', v_n; END IF;

  RAISE NOTICE 'H OK: falha no meio da limpeza = nada apagado (transacao unica)';
END $$;

-- ── I) email_drafts nao existe nesta branch: ramo condicional inerte ────────
DO $$
BEGIN
  IF to_regclass('public.email_drafts') IS NOT NULL THEN
    RAISE NOTICE 'I: public.email_drafts EXISTE nesta base — o DELETE condicional da funcao vale e foi exercitado acima';
  ELSE
    RAISE NOTICE 'I OK: public.email_drafts nao existe nesta base — o ramo condicional fica inerte (a funcao nao cria tabela nem quebra)';
  END IF;
END $$;

-- ── B/C) ADMIN apaga a conta desconectada ───────────────────────────────────
DO $$
DECLARE
  v_res jsonb;
  v_n   bigint;
  v_adm uuid := '11111111-1111-4111-8111-111111111111';
  v_a1  uuid := '4a000000-0000-4000-8000-000000000001';
  v_a2  uuid := '4a000000-0000-4000-8000-000000000002';
BEGIN
  v_res := pg_temp.prova('authenticated', v_adm, v_a1, 'conta-apagar@exemplo-teste.test');

  IF v_res ->> 'sqlstate' IS NOT NULL THEN
    RAISE EXCEPTION 'B: admin deveria conseguir limpar a conta desconectada, veio %', v_res;
  END IF;

  -- Contagens devolvidas: 2 anexos, 2 mensagens, 1 thread, 0 drafts, 5 no total.
  IF (v_res -> 'deleted' ->> 'email_attachments')::bigint <> 2
     OR (v_res -> 'deleted' ->> 'email_messages')::bigint <> 2
     OR (v_res -> 'deleted' ->> 'email_threads')::bigint <> 1
     OR (v_res -> 'deleted' ->> 'email_drafts')::bigint <> 0
     OR (v_res ->> 'total_rows')::bigint <> 5 THEN
    RAISE EXCEPTION 'B: contagens devolvidas erradas: %', v_res;
  END IF;

  -- E o banco confirma: os dados de e-mail da conta sumiram.
  SELECT count(*) INTO v_n FROM public.email_threads WHERE gmail_account_id = v_a1;
  IF v_n <> 0 THEN RAISE EXCEPTION 'B: sobraram threads da conta apagada (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_messages WHERE gmail_account_id = v_a1;
  IF v_n <> 0 THEN RAISE EXCEPTION 'B: sobraram mensagens da conta apagada (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_attachments a
     LEFT JOIN public.email_messages m ON m.id = a.email_message_id
    WHERE a.id IN ('7d000000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000002');
  IF v_n <> 0 THEN RAISE EXCEPTION 'B: sobraram anexos da conta apagada (%)', v_n; END IF;

  -- C) A conta continua existindo (a limpeza e dos e-mails, nao da conta)...
  SELECT count(*) INTO v_n FROM public.gmail_accounts WHERE id = v_a1;
  IF v_n <> 1 THEN RAISE EXCEPTION 'C: a conta deveria continuar existindo (%)', v_n; END IF;

  -- ...e o vizinho (conta ativa) nao perdeu nada.
  SELECT count(*) INTO v_n FROM public.email_messages WHERE gmail_account_id = v_a2;
  IF v_n <> 1 THEN RAISE EXCEPTION 'C: conta vizinha perdeu mensagens (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_threads WHERE gmail_account_id = v_a2;
  IF v_n <> 1 THEN RAISE EXCEPTION 'C: conta vizinha perdeu threads (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_attachments;
  IF v_n <> 1 THEN RAISE EXCEPTION 'C: anexos restantes esperados 1, achei %', v_n; END IF;

  RAISE NOTICE 'B/C OK: admin apagou 5 linhas (anexos 2, mensagens 2, threads 1) e a conta vizinha ficou intacta';
END $$;

-- ── G) Auditoria: quem, quando, quantas — sem e-mail completo e sem conteudo ─
DO $$
DECLARE
  v_linha public.audit_logs;
  v_adm   uuid := '11111111-1111-4111-8111-111111111111';
BEGIN
  SELECT * INTO v_linha
    FROM public.audit_logs
   WHERE action = 'gmail_account_data_purged'
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN RAISE EXCEPTION 'G: nenhum registro de auditoria da limpeza'; END IF;

  IF v_linha.user_id <> v_adm THEN
    RAISE EXCEPTION 'G: auditoria sem o admin que executou (user_id=%)', v_linha.user_id;
  END IF;
  IF v_linha.created_at IS NULL THEN RAISE EXCEPTION 'G: auditoria sem data'; END IF;
  IF v_linha.entity_type <> 'gmail_account'
     OR v_linha.entity_id <> '4a000000-0000-4000-8000-000000000001'::uuid THEN
    RAISE EXCEPTION 'G: auditoria aponta para o alvo errado (% / %)', v_linha.entity_type, v_linha.entity_id;
  END IF;
  IF (v_linha.details -> 'deleted' ->> 'email_messages')::bigint <> 2
     OR (v_linha.details ->> 'total_rows')::bigint <> 5 THEN
    RAISE EXCEPTION 'G: auditoria sem a contagem de linhas: %', v_linha.details;
  END IF;

  -- Sem e-mail completo e sem nenhum assunto/corpo/remetente.
  IF position('conta-apagar@exemplo-teste.test' in v_linha.details::text) > 0 THEN
    RAISE EXCEPTION 'G: o e-mail COMPLETO vazou para a auditoria: %', v_linha.details;
  END IF;
  IF v_linha.details ->> 'email_masked' <> 'c***@***' THEN
    RAISE EXCEPTION 'G: mascara inesperada: %', v_linha.details ->> 'email_masked';
  END IF;
  IF position('Assunto secreto' in v_linha.details::text) > 0
     OR position('corpo reservado' in v_linha.details::text) > 0
     OR position('remetente@exemplo-teste.test' in v_linha.details::text) > 0 THEN
    RAISE EXCEPTION 'G: conteudo de e-mail vazou para a auditoria: %', v_linha.details;
  END IF;

  RAISE NOTICE 'G OK: audit_logs com user_id/created_at/contagens e SEM e-mail completo e SEM conteudo';
END $$;

ROLLBACK;
