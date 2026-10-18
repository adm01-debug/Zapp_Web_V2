-- contacts.consent_status: valores validos + guarda de escrita (LGPD / Talk X N10)
--
-- Prende a garantia da migration 20261016010744_consent_status_guard.sql:
--   1. CHECK contacts_consent_status_valores -> so granted/unknown/revoked (NULL = nao informado);
--   2. gatilho trg_contacts_consent_status_guard -> BEFORE UPDATE de consent_status:
--      quem NAO e admin, service_role nem rotina interna (talkx_suppress_contact roda com
--      auth.role() = 'service_role') NAO muda o eixo, e a tentativa fica em audit_logs
--      (action = contact_consent_status_change_denied);
--   3. a rotina interna de consentimento continua funcionando.
--
-- Roda no banco LOCAL reaproveitando as migrations REAIS (nao recria schema):
--   zapp-db-local psql <copia> <conjunto> < supabase/tests/contacts_consent_status_guard.sql
--
-- Papel real em cada caso (nunca "como postgres" para provar a negacao):
--   SET LOCAL ROLE authenticated + request.jwt.claims{role,sub} reproduz o que o PostgREST
--   entrega ao Postgres; anon vai por SET LOCAL ROLE anon; a rotina interna por
--   SET LOCAL ROLE service_role (que e o que talkx_suppress_contact exige do chamador).

-- ---------------------------------------------------------------------------
-- Fixture. session_replication_role=replica desliga os gatilhos de auth.users/
-- profiles/contacts durante a montagem e VOLTA a DEFAULT antes dos casos (senao o
-- proprio gatilho sob teste ficaria desligado).
-- ---------------------------------------------------------------------------
SET session_replication_role = replica;

-- Limpeza de execucao anterior: SO os ids fixos deste teste, nunca em massa.
DELETE FROM public.talkx_blacklist WHERE contact_id IN (
  'cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000002',
  'cccccccc-0000-4000-8000-000000000003','cccccccc-0000-4000-8000-000000000004',
  'cccccccc-0000-4000-8000-000000000005','cccccccc-0000-4000-8000-000000000006');
DELETE FROM public.audit_logs WHERE entity_id IN (
  'cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000002',
  'cccccccc-0000-4000-8000-000000000003','cccccccc-0000-4000-8000-000000000004',
  'cccccccc-0000-4000-8000-000000000005','cccccccc-0000-4000-8000-000000000006')
  AND action LIKE 'contact_consent_status%';
DELETE FROM public.contacts WHERE id IN (
  'cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000002',
  'cccccccc-0000-4000-8000-000000000003','cccccccc-0000-4000-8000-000000000004',
  'cccccccc-0000-4000-8000-000000000005','cccccccc-0000-4000-8000-000000000006');
DELETE FROM public.user_roles WHERE user_id IN (
  'aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002',
  'aaaaaaaa-0000-4000-8000-000000000003');
DELETE FROM public.profiles WHERE id IN (
  'bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002',
  'bbbbbbbb-0000-4000-8000-000000000003');
DELETE FROM auth.users WHERE id IN (
  'aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002',
  'aaaaaaaa-0000-4000-8000-000000000003');

INSERT INTO auth.users (id) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001'),
  ('aaaaaaaa-0000-4000-8000-000000000002'),
  ('aaaaaaaa-0000-4000-8000-000000000003');

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Fixture Admin LGPD'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002', 'Fixture Supervisor LGPD'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000003', 'Fixture Agente LGPD');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'supervisor'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'agent');

-- Contatos atribuidos ao perfil do agente: o predicado da policy de UPDATE
-- (can_edit_contact) casa por assigned_to IN get_visible_agent_ids(uid), entao o
-- agente REALMENTE alcanca a linha -- e a negacao tem de vir do gatilho, nao do RLS.
INSERT INTO public.contacts (id, name, phone, assigned_to, consent_status) VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'Fixture Contato 1', '5511900000001', 'bbbbbbbb-0000-4000-8000-000000000003', 'revoked'),
  ('cccccccc-0000-4000-8000-000000000002', 'Fixture Contato 2', '5511900000002', 'bbbbbbbb-0000-4000-8000-000000000003', 'revoked'),
  ('cccccccc-0000-4000-8000-000000000003', 'Fixture Contato 3', '5511900000003', 'bbbbbbbb-0000-4000-8000-000000000003', 'unknown'),
  ('cccccccc-0000-4000-8000-000000000004', 'Fixture Contato 4', '5511900000004', 'bbbbbbbb-0000-4000-8000-000000000003', 'unknown'),
  ('cccccccc-0000-4000-8000-000000000005', 'Fixture Contato 5', '5511900000005', 'bbbbbbbb-0000-4000-8000-000000000003', 'revoked'),
  ('cccccccc-0000-4000-8000-000000000006', 'Fixture Contato 6', '5511900000006', 'bbbbbbbb-0000-4000-8000-000000000003', 'unknown');

SET session_replication_role = DEFAULT;

-- ---------------------------------------------------------------------------
-- T0. Estrutura: CHECK existe e o gatilho existe; `authenticated` PODE escrever
--     a coluna (e por isso a guarda e necessaria: o RLS sozinho nao barra).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_check text;
  v_trg   int;
  v_grant boolean;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_check
  FROM pg_constraint c
  WHERE c.conrelid = 'public.contacts'::regclass
    AND c.conname = 'contacts_consent_status_valores'
    AND c.contype = 'c';

  IF v_check IS NULL THEN
    RAISE EXCEPTION 'T0 FALHOU: sem CHECK contacts_consent_status_valores em public.contacts';
  END IF;
  IF v_check NOT LIKE '%granted%' OR v_check NOT LIKE '%unknown%' OR v_check NOT LIKE '%revoked%' THEN
    RAISE EXCEPTION 'T0 FALHOU: CHECK nao restringe os tres valores do Talk X (def=%)', v_check;
  END IF;

  SELECT count(*) INTO v_trg
  FROM pg_trigger
  WHERE tgrelid = 'public.contacts'::regclass
    AND tgname = 'trg_contacts_consent_status_guard'
    AND NOT tgisinternal;

  IF v_trg <> 1 THEN
    RAISE EXCEPTION 'T0 FALHOU: gatilho trg_contacts_consent_status_guard ausente em public.contacts';
  END IF;

  v_grant := has_column_privilege('authenticated', 'public.contacts', 'consent_status', 'UPDATE');
  IF NOT v_grant THEN
    RAISE NOTICE 'T0: authenticated NAO tem UPDATE em consent_status (a negacao vem do GRANT, nao do gatilho)';
  END IF;

  RAISE NOTICE 'T0 ok: CHECK=% / gatilho presente / authenticated UPDATE na coluna=%', v_check, v_grant;
END $$;

-- ---------------------------------------------------------------------------
-- T1. Valor invalido e recusado (23514) — quem escreve aqui e a conexao do dono
--     (sem JWT), ou seja: passa pela guarda e BATE no CHECK.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bateu boolean := false;
BEGIN
  BEGIN
    UPDATE public.contacts SET consent_status = 'opt_in'
    WHERE id = 'cccccccc-0000-4000-8000-000000000006';
  EXCEPTION WHEN check_violation THEN
    v_bateu := true;
  END;

  IF NOT v_bateu THEN
    RAISE EXCEPTION 'T1 FALHOU: consent_status=opt_in foi aceito (sem 23514)';
  END IF;

  BEGIN
    UPDATE public.contacts SET consent_status = 'GRANTED'
    WHERE id = 'cccccccc-0000-4000-8000-000000000006';
    RAISE EXCEPTION 'T1 FALHOU: consent_status=GRANTED (caixa alta) foi aceito';
  EXCEPTION WHEN check_violation THEN
    NULL; -- esperado
  END;

  RAISE NOTICE 'T1 ok: opt_in e GRANTED recusados com check_violation';
END $$;

-- ---------------------------------------------------------------------------
-- T2. AGENTE (papel real): UPDATE direto de consent_status e NEGADO e a tentativa
--     fica auditada; o resto do UPDATE (nome) continua aplicando.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_consent text;
  v_nome text;
  v_audit int;
  v_to text;
  v_from text;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}', true);

  UPDATE public.contacts
     SET consent_status = 'granted',
         name = 'Fixture Contato 1 (agente tentou)'
   WHERE id = 'cccccccc-0000-4000-8000-000000000001';

  EXECUTE 'RESET ROLE';

  SELECT consent_status, name INTO v_consent, v_nome
  FROM public.contacts WHERE id = 'cccccccc-0000-4000-8000-000000000001';

  IF v_consent <> 'revoked' THEN
    RAISE EXCEPTION 'T2 FALHOU: agente mudou consent_status para % (devia seguir revoked)', v_consent;
  END IF;
  IF v_nome <> 'Fixture Contato 1 (agente tentou)' THEN
    RAISE EXCEPTION 'T2 FALHOU: a guarda bloqueou o UPDATE inteiro (nome=%) — devia barrar so a coluna', v_nome;
  END IF;

  SELECT count(*), max(details->>'to'), max(details->>'from') INTO v_audit, v_to, v_from
  FROM public.audit_logs
  WHERE action = 'contact_consent_status_change_denied'
    AND entity_type = 'contacts'
    AND entity_id = 'cccccccc-0000-4000-8000-000000000001';

  IF v_audit <> 1 THEN
    RAISE EXCEPTION 'T2 FALHOU: esperava 1 linha de auditoria da tentativa, achei %', v_audit;
  END IF;
  IF v_to <> 'granted' OR v_from <> 'revoked' THEN
    RAISE EXCEPTION 'T2 FALHOU: auditoria sem from/to corretos (from=%, to=%)', v_from, v_to;
  END IF;

  RAISE NOTICE 'T2 ok: agente negado (segue revoked), nome aplicou, 1 linha em audit_logs';
END $$;

-- ---------------------------------------------------------------------------
-- T3. SUPERVISOR (papel real): tambem NEGADO e auditado (a decisao de
--     consentimento e do admin).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_consent text;
  v_audit int;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}', true);

  UPDATE public.contacts SET consent_status = 'granted'
   WHERE id = 'cccccccc-0000-4000-8000-000000000002';

  EXECUTE 'RESET ROLE';

  SELECT consent_status INTO v_consent FROM public.contacts
  WHERE id = 'cccccccc-0000-4000-8000-000000000002';
  IF v_consent <> 'revoked' THEN
    RAISE EXCEPTION 'T3 FALHOU: supervisor mudou consent_status para % (devia seguir revoked)', v_consent;
  END IF;

  SELECT count(*) INTO v_audit FROM public.audit_logs
  WHERE action = 'contact_consent_status_change_denied'
    AND entity_id = 'cccccccc-0000-4000-8000-000000000002';
  IF v_audit <> 1 THEN
    RAISE EXCEPTION 'T3 FALHOU: esperava 1 linha de auditoria, achei %', v_audit;
  END IF;

  RAISE NOTICE 'T3 ok: supervisor negado e auditado';
END $$;

-- ---------------------------------------------------------------------------
-- T4. ADMIN (papel real): PERMITIDO — e sem linha de negacao na trilha.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_consent text;
  v_audit int;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

  UPDATE public.contacts SET consent_status = 'granted'
   WHERE id = 'cccccccc-0000-4000-8000-000000000003';

  EXECUTE 'RESET ROLE';

  SELECT consent_status INTO v_consent FROM public.contacts
  WHERE id = 'cccccccc-0000-4000-8000-000000000003';
  IF v_consent <> 'granted' THEN
    RAISE EXCEPTION 'T4 FALHOU: admin nao conseguiu mudar consent_status (ficou %)', v_consent;
  END IF;

  SELECT count(*) INTO v_audit FROM public.audit_logs
  WHERE action = 'contact_consent_status_change_denied'
    AND entity_id = 'cccccccc-0000-4000-8000-000000000003';
  IF v_audit <> 0 THEN
    RAISE EXCEPTION 'T4 FALHOU: admin gerou % linha(s) de negacao', v_audit;
  END IF;

  RAISE NOTICE 'T4 ok: admin mudou o eixo (granted) sem trilha de negacao';
END $$;

-- ---------------------------------------------------------------------------
-- T5. ANON (papel real): negado. O anon TEM o GRANT de tabela (padrao Supabase:
--     RLS e a guarda), mas nao existe policy de UPDATE para ele -> 0 linhas
--     afetadas, valor intacto e nenhuma linha de auditoria.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_linhas int := 0;
  v_sem_privilegio boolean := false;
  v_consent text;
  v_audit int;
BEGIN
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);

  BEGIN
    UPDATE public.contacts SET consent_status = 'granted'
     WHERE id = 'cccccccc-0000-4000-8000-000000000005';
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_sem_privilegio := true;
  END;

  EXECUTE 'RESET ROLE';

  SELECT consent_status INTO v_consent FROM public.contacts
  WHERE id = 'cccccccc-0000-4000-8000-000000000005';
  SELECT count(*) INTO v_audit FROM public.audit_logs
  WHERE entity_id = 'cccccccc-0000-4000-8000-000000000005'
    AND action = 'contact_consent_status_change_denied';

  IF NOT (v_sem_privilegio OR v_linhas = 0) THEN
    RAISE EXCEPTION 'T5 FALHOU: anon atualizou % linha(s) de public.contacts', v_linhas;
  END IF;
  IF v_consent <> 'revoked' THEN
    RAISE EXCEPTION 'T5 FALHOU: anon mudou consent_status para %', v_consent;
  END IF;
  IF v_audit <> 0 THEN
    RAISE EXCEPTION 'T5 FALHOU: anon gerou % linha(s) de auditoria (nao chegou no gatilho)', v_audit;
  END IF;

  RAISE NOTICE 'T5 ok: anon negado (% linhas, sem_privilegio=%), valor intacto, sem trilha',
    v_linhas, v_sem_privilegio;
END $$;

-- ---------------------------------------------------------------------------
-- T6. UPDATE do agente que NAO toca consent_status continua passando (a guarda
--     nao e um muro na frente da edicao normal de contato).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_nome text;
  v_audit int;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}', true);

  UPDATE public.contacts SET name = 'Fixture Contato 5 (editado pelo agente)'
   WHERE id = 'cccccccc-0000-4000-8000-000000000005';

  EXECUTE 'RESET ROLE';

  SELECT name INTO v_nome FROM public.contacts WHERE id = 'cccccccc-0000-4000-8000-000000000005';
  IF v_nome <> 'Fixture Contato 5 (editado pelo agente)' THEN
    RAISE EXCEPTION 'T6 FALHOU: edicao normal do contato pelo agente nao aplicou (nome=%)', v_nome;
  END IF;

  SELECT count(*) INTO v_audit FROM public.audit_logs
  WHERE entity_id = 'cccccccc-0000-4000-8000-000000000005'
    AND action = 'contact_consent_status_change_denied';
  IF v_audit <> 0 THEN
    RAISE EXCEPTION 'T6 FALHOU: edicao sem consent_status gerou auditoria de negacao';
  END IF;

  RAISE NOTICE 'T6 ok: agente edita o contato normalmente quando nao toca o consentimento';
END $$;

-- ---------------------------------------------------------------------------
-- T7. CRITERIO 2 — a rotina REAL de consentimento continua funcionando.
--     `public.talkx_suppress_contact` e SECURITY DEFINER, exige
--     auth.role() = 'service_role' do chamador e, quando p_origin = 'auto_optout',
--     marca contacts.consent_status = 'revoked' (migration
--     20261003232707_talkx_lgpd_consentimento_expurgo.sql, X032). O UPDATE da
--     rotina passa pela guarda (dispara o gatilho BEFORE UPDATE da coluna) e e
--     ACEITO — sem trilha de negacao. Casos:
--       T7a -- a rotina REAL, pela assinatura COMPLETA de 7 argumentos
--              (o 7o, p_campaign_id, tem default mas aqui vai explicito), sobre um
--              contato AINDA 'unknown' (id 4) e SEM UPDATE direto antes: tem de
--              virar 'revoked' e NAO gerar linha de negacao em audit_logs.
--       T7b -- escrita DIRETA com service_role (rotina interna / service key) num
--              contato 'unknown' (id 6): muda o eixo, sem trilha de negacao.
--     A rotina real e PRE-REQUISITO do criterio 2: se
--     `talkx_suppress_contact(...)` nao existir no banco local, o teste FALHA
--     (nao passa em silencio com NOTICE).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_consent text;
  v_ret uuid;
  v_audit int;
  v_existe boolean;
BEGIN
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT to_regprocedure(
           'public.talkx_suppress_contact(uuid, text, text, public.talkx_blacklist_reason, text, uuid, uuid)'
         ) IS NOT NULL INTO v_existe;

  IF NOT v_existe THEN
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'T7 FALHOU: public.talkx_suppress_contact(uuid,text,text,talkx_blacklist_reason,text,uuid,uuid) nao existe no banco local — o criterio 2 exige a rotina real';
  END IF;

  -- T7a: rotina REAL sobre o contato 4 (ainda 'unknown'), sem UPDATE direto antes.
  EXECUTE format(
    $q$SELECT public.talkx_suppress_contact(%L::uuid, %L::text, %L::text, %L::public.talkx_blacklist_reason, %L::text, %L::uuid, %L::uuid)$q$,
    'cccccccc-0000-4000-8000-000000000004', '5511900000004',
    'Fixture opt-out LGPD', 'opt_out', 'auto_optout', NULL, NULL
  ) INTO v_ret;

  -- T7b: escrita direta com service_role sobre o contato 6 (ainda 'unknown').
  UPDATE public.contacts SET consent_status = 'revoked'
   WHERE id = 'cccccccc-0000-4000-8000-000000000006'
     AND consent_status IS DISTINCT FROM 'revoked';

  EXECUTE 'RESET ROLE';

  SELECT consent_status INTO v_consent FROM public.contacts
  WHERE id = 'cccccccc-0000-4000-8000-000000000004';
  IF v_consent <> 'revoked' THEN
    RAISE EXCEPTION 'T7 FALHOU: talkx_suppress_contact nao revogou o contato 4 (consent_status=%)', v_consent;
  END IF;

  SELECT consent_status INTO v_consent FROM public.contacts
  WHERE id = 'cccccccc-0000-4000-8000-000000000006';
  IF v_consent <> 'revoked' THEN
    RAISE EXCEPTION 'T7 FALHOU: a escrita direta com service_role foi barrada (consent_status=%)', v_consent;
  END IF;

  SELECT count(*) INTO v_audit FROM public.audit_logs
  WHERE action = 'contact_consent_status_change_denied'
    AND entity_type = 'contacts'
    AND entity_id IN ('cccccccc-0000-4000-8000-000000000004','cccccccc-0000-4000-8000-000000000006');
  IF v_audit <> 0 THEN
    RAISE EXCEPTION 'T7 FALHOU: rotina interna gerou % linha(s) de negacao em audit_logs', v_audit;
  END IF;

  RAISE NOTICE 'T7 ok: rotina REAL talkx_suppress_contact revogou o contato 4 (retorno=%) e a escrita service_role o contato 6, sem trilha de negacao', v_ret;
END $$;

-- ---------------------------------------------------------------------------
-- Limpeza: so o fixture deste teste.
-- ---------------------------------------------------------------------------
SET session_replication_role = replica;
DELETE FROM public.talkx_blacklist WHERE contact_id IN (
  'cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000002',
  'cccccccc-0000-4000-8000-000000000003','cccccccc-0000-4000-8000-000000000004',
  'cccccccc-0000-4000-8000-000000000005','cccccccc-0000-4000-8000-000000000006');
DELETE FROM public.audit_logs WHERE entity_id IN (
  'cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000002',
  'cccccccc-0000-4000-8000-000000000003','cccccccc-0000-4000-8000-000000000004',
  'cccccccc-0000-4000-8000-000000000005','cccccccc-0000-4000-8000-000000000006')
  AND action LIKE 'contact_consent_status%';
DELETE FROM public.contacts WHERE id IN (
  'cccccccc-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000002',
  'cccccccc-0000-4000-8000-000000000003','cccccccc-0000-4000-8000-000000000004',
  'cccccccc-0000-4000-8000-000000000005','cccccccc-0000-4000-8000-000000000006');
DELETE FROM public.user_roles WHERE user_id IN (
  'aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002',
  'aaaaaaaa-0000-4000-8000-000000000003');
DELETE FROM public.profiles WHERE id IN (
  'bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002',
  'bbbbbbbb-0000-4000-8000-000000000003');
DELETE FROM auth.users WHERE id IN (
  'aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002',
  'aaaaaaaa-0000-4000-8000-000000000003');
SET session_replication_role = DEFAULT;

DO $$ BEGIN
  RAISE NOTICE 'contacts_consent_status_guard: TODOS OS CASOS PASSARAM (T0..T7)';
END $$;
