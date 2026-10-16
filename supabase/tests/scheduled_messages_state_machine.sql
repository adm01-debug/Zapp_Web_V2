-- supabase/tests/scheduled_messages_state_machine.sql
-- HZ5-03 / HZ1-03 -- maquina de estados, CHECKs e INSERT so para contato visivel em
-- public.scheduled_messages (migration 20261016013528_scheduled_messages_state_machine.sql).
--
-- PROVA DE ENFORCEMENT NO BANCO LOCAL, com o papel real. Nao e suite estrutural: as
-- assercoes trocam o papel (authenticated/admin, authenticated/agente, anon, service_role)
-- e executam INSERT/UPDATE de verdade, mostrando o que passa e o que e negado. As divisoes
-- de papel sao as do PostgREST (o JWT so executa como authenticated ou anon); o despachante
-- entra como service_role (e, no cron, como o dono da RPC SECURITY DEFINER -- os dois caem
-- no ramo "nao e authenticated/anon" do gatilho).
--
-- BLOCO RED (logo abaixo das fixtures): com o gatilho removido e as policies antigas de volta,
-- dentro de um SAVEPOINT, os MESMOS casos que a migration tem de barrar PASSAM. E a prova de
-- que a suite falha sem a migration; o SAVEPOINT devolve o estado (DDL no Postgres e
-- transacional) e o resto do arquivo roda contra o estado real.
--
-- Rodar no banco local em dia (todas as migrations aplicadas):
--   zapp-db-local up . <nome-curto>      # ex.: hz503 (o nome derivado da pasta desta copia
--                                        # tem 28 caracteres e a ferramenta nao acha o
--                                        # conteiner do banco; o nome curto entra explicito)
--   zapp-db-local psql . <nome-curto> < supabase/tests/scheduled_messages_state_machine.sql
-- A sessao do psql precisa ser superusuario (postgres) para montar as fixtures e trocar de
-- papel; as assercoes de acesso rodam sob SET LOCAL ROLE. Termina com PROVA_OK=1 e a
-- contagem de assercoes. Nada fica no banco: a transacao inteira termina com ROLLBACK
-- (inclusive a tabela-contador e as fixtures de auth/profiles/contacts).

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL session_replication_role = replica;

-- ---------------------------------------------------------------------------
-- Fixtures sinteticas (sem dado de cliente): 1 admin, 1 agente, 1 outro agente.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id) VALUES
  ('11111111-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000002'),
  ('11111111-0000-4000-8000-000000000003');

INSERT INTO public.profiles (id, user_id, name, can_download, created_at, updated_at) VALUES
  ('11111111-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000001', 'Prova Admin', false, now(), now()),
  ('11111111-0000-4000-8000-000000000012', '11111111-0000-4000-8000-000000000002', 'Prova Agente', false, now(), now()),
  ('11111111-0000-4000-8000-000000000013', '11111111-0000-4000-8000-000000000003', 'Prova Outro', false, now(), now());

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-0000-4000-8000-000000000001', 'admin'),
  ('11111111-0000-4000-8000-000000000002', 'agent'),
  ('11111111-0000-4000-8000-000000000003', 'agent');

-- C_VIS: do agente (visivel para ele). C_ADMIN: do admin. C_OUTRO: de outro agente
-- (invisivel para o agente que agenda).
INSERT INTO public.contacts (id, name, phone, conversation_status, is_lid_legacy, assigned_to, queue_id, created_at, updated_at) VALUES
  ('22222222-0000-4000-8000-00000000000a', 'Prova Contato Visivel', '+550****0001', 'open', false, '11111111-0000-4000-8000-000000000012', NULL, now(), now()),
  ('22222222-0000-4000-8000-00000000000b', 'Prova Contato Admin',   '+550****0002', 'open', false, '11111111-0000-4000-8000-000000000011', NULL, now(), now()),
  ('22222222-0000-4000-8000-00000000000c', 'Prova Contato Outro',   '+550****0003', 'open', false, '11111111-0000-4000-8000-000000000013', NULL, now(), now());

-- Linha ja enviada, do agente (fixture: inserida como dono do banco, que nao passa pelo
-- portao do usuario).
INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by)
VALUES ('33333333-0000-4000-8000-000000000001', '22222222-0000-4000-8000-00000000000a',
        'ja enviada', 'text', now() - interval '1 hour', 'sent', '11111111-0000-4000-8000-000000000012');

SET LOCAL session_replication_role = default;

-- ---------------------------------------------------------------------------
-- Contador de assercoes: tabela de verdade (nao GUC), para funcionar tambem quando a
-- assercao roda sob outro papel. Criada dentro da transacao e desfeita no ROLLBACK.
-- ---------------------------------------------------------------------------
CREATE TABLE public.prova_hz503_asserts (marcador text NOT NULL);
GRANT INSERT ON public.prova_hz503_asserts TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Helpers de assercao. Nao trocam de papel: quem troca e o proprio script, com
-- SET LOCAL ROLE + set_config('request.jwt.claims') no nivel de cima -- o papel e as
-- claims valem para tudo que roda depois, sem depender de escopo de funcao.
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.assert_permitido(p_sql text, p_rotulo text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO public.prova_hz503_asserts (marcador) VALUES ('assert');
  EXECUTE p_sql;
  RAISE NOTICE 'OK (passou): %', p_rotulo;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'FALHOU: % -- deveria passar e foi negado: % (SQLSTATE=%)',
    p_rotulo, SQLERRM, SQLSTATE;
END;
$fn$;

CREATE FUNCTION pg_temp.assert_negado(p_sql text, p_sqlstates text, p_trecho text, p_rotulo text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO public.prova_hz503_asserts (marcador) VALUES ('assert');
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'FALHOU: % -- deveria ser negado e passou', p_rotulo;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALHOU:%' THEN
      RAISE;
    END IF;
    IF position(SQLSTATE in p_sqlstates) = 0 THEN
      RAISE EXCEPTION 'FALHOU: % -- negado com SQLSTATE % (esperado %): %',
        p_rotulo, SQLSTATE, p_sqlstates, SQLERRM;
    END IF;
    IF position(p_trecho in SQLERRM) = 0 THEN
      RAISE EXCEPTION 'FALHOU: % -- negado pelo motivo errado (esperado conter "%"): "%"',
        p_rotulo, p_trecho, SQLERRM;
    END IF;
    RAISE NOTICE 'OK (negado %): % -- %', SQLSTATE, p_rotulo, SQLERRM;
  END;
END;
$fn$;

-- O banco local revoga EXECUTE de PUBLIC por padrao nas funcoes novas: sem estes GRANT,
-- a primeira chamada depois de SET LOCAL ROLE authenticated seria negada por privilegio.
GRANT EXECUTE ON FUNCTION pg_temp.assert_permitido(text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.assert_negado(text, text, text, text) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- BLOCO RED -- o defeito ANTES da migration. Devolve gatilho, CHECKs e o texto ANTIGO das
-- duas policies (o da tabela em 20251220182411), roda os casos que a migration tem de
-- barrar e mostra que PASSAM. Depois o SAVEPOINT e desfeito.
-- ---------------------------------------------------------------------------
SAVEPOINT antes_da_migration;

DROP TRIGGER IF EXISTS trg_scheduled_messages_state_machine ON public.scheduled_messages;
ALTER TABLE public.scheduled_messages DROP CONSTRAINT IF EXISTS scheduled_messages_status_valid_check;
ALTER TABLE public.scheduled_messages DROP CONSTRAINT IF EXISTS scheduled_messages_message_type_valid_check;
DROP POLICY IF EXISTS "Users can create scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can create scheduled messages" ON public.scheduled_messages
  FOR INSERT TO authenticated
  WITH CHECK (created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update their scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can update their scheduled messages" ON public.scheduled_messages
  FOR UPDATE TO authenticated
  USING (created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
         OR public.is_admin_or_supervisor(auth.uid()));

SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_permitido(
  $q$insert into public.scheduled_messages (contact_id, content, message_type, scheduled_at, created_by)
     values ('22222222-0000-4000-8000-00000000000c', 'agenda para contato que nao enxerga',
             'text', now() + interval '1 hour', '11111111-0000-4000-8000-000000000012')$q$,
  'RED: sem a migration, agente agenda para contato que NAO enxerga');

SELECT pg_temp.assert_permitido(
  $q$update public.scheduled_messages set status = 'pending'
     where id = '33333333-0000-4000-8000-000000000001'$q$,
  'RED: sem a migration, agente volta sent -> pending (reenvio)');

SELECT pg_temp.assert_permitido(
  $q$update public.scheduled_messages set content = 'editando o que ja foi enviado'
     where id = '33333333-0000-4000-8000-000000000001'$q$,
  'RED: sem a migration, agente edita a agendada ja enviada');

SELECT pg_temp.assert_permitido(
  $q$insert into public.scheduled_messages (contact_id, content, message_type, scheduled_at, created_by)
     values ('22222222-0000-4000-8000-00000000000a', 'tipo invalido',
             'banana', now() + interval '1 hour', '11111111-0000-4000-8000-000000000012')$q$,
  'RED: sem a migration, message_type fora da lista e aceito');

RESET ROLE;
ROLLBACK TO SAVEPOINT antes_da_migration;

-- ---------------------------------------------------------------------------
-- 0. Estrutura viva (o que existe no banco, nao texto de arquivo).
-- ---------------------------------------------------------------------------
DO $blk$
DECLARE
  v_def text;
  v_trg integer;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.scheduled_messages'::regclass
    AND conname = 'scheduled_messages_status_valid_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'FALHOU: constraint scheduled_messages_status_valid_check ausente';
  END IF;
  IF position('pending' in v_def) = 0 OR position('sent' in v_def) = 0
     OR position('failed' in v_def) = 0 OR position('cancelled' in v_def) = 0
     OR position('expired' in v_def) = 0 THEN
    RAISE EXCEPTION 'FALHOU: constraint de status sem o vocabulario do despachante: %', v_def;
  END IF;
  RAISE NOTICE 'OK (estrutura): CHECK de status do despachante -- %', v_def;

  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.scheduled_messages'::regclass
    AND conname = 'scheduled_messages_message_type_valid_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'FALHOU: constraint de message_type ausente';
  END IF;
  RAISE NOTICE 'OK (estrutura): CHECK de message_type -- %', v_def;

  SELECT count(*) INTO v_trg
  FROM pg_trigger
  WHERE tgrelid = 'public.scheduled_messages'::regclass
    AND tgname = 'trg_scheduled_messages_state_machine'
    AND NOT tgisinternal
    AND (tgtype & 1) = 1   -- ROW (TRIGGER_TYPE_ROW)
    AND (tgtype & 2) = 2   -- BEFORE
    AND (tgtype & 4) = 4   -- INSERT
    AND (tgtype & 16) = 16; -- UPDATE
  IF v_trg <> 1 THEN
    RAISE EXCEPTION 'FALHOU: gatilho BEFORE INSERT OR UPDATE ausente (% linhas)', v_trg;
  END IF;
  RAISE NOTICE 'OK (estrutura): gatilho BEFORE INSERT OR UPDATE presente';

  IF has_function_privilege('authenticated', 'public.enforce_scheduled_message_state()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: authenticated ainda pode executar a funcao do gatilho';
  END IF;
  IF has_function_privilege('anon', 'public.enforce_scheduled_message_state()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: anon ainda pode executar a funcao do gatilho';
  END IF;
  RAISE NOTICE 'OK (estrutura): EXECUTE revogado de PUBLIC/anon/authenticated';
END
$blk$;

-- ---------------------------------------------------------------------------
-- 1. ADMIN (authenticated, role admin)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_permitido(
  $q$insert into public.scheduled_messages (contact_id, content, message_type, scheduled_at)
     values ('22222222-0000-4000-8000-00000000000b', 'admin agenda para contato de outro agente',
             'text', now() + interval '1 hour')$q$,
  'admin agenda para contato de outro agente (visibilidade administrativa)');

SELECT pg_temp.assert_negado(
  $q$insert into public.scheduled_messages (contact_id, content, message_type, scheduled_at, status)
     values ('22222222-0000-4000-8000-00000000000b', 'nasce como enviada',
             'text', now() + interval '1 hour', 'sent')$q$,
  '22023', 'must_be_pending',
  'INSERT com status diferente de pending e negado (nasce pending)');

SELECT pg_temp.assert_negado(
  $q$insert into public.scheduled_messages (contact_id, content, message_type, scheduled_at)
     values ('22222222-0000-4000-8000-00000000000b', 'agenda no passado',
             'text', now() - interval '1 minute')$q$,
  '22023', 'must_be_future',
  'INSERT com scheduled_at no passado e negado');

SELECT pg_temp.assert_negado(
  $q$insert into public.scheduled_messages (contact_id, content, message_type, scheduled_at)
     values ('22222222-0000-4000-8000-00000000000b', 'tipo invalido',
             'banana', now() + interval '1 hour')$q$,
  '23514', 'message_type',
  'INSERT com message_type fora da lista e negado pelo CHECK');

-- ---------------------------------------------------------------------------
-- 2. AGENTE (authenticated, role agent)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_negado(
  $q$update public.scheduled_messages set status = 'pending'
     where id = '33333333-0000-4000-8000-000000000001'$q$,
  '42501', 'scheduled_message_not_pending',
  'agente NAO volta sent -> pending (sem reenvio)');

SELECT pg_temp.assert_negado(
  $q$update public.scheduled_messages set content = 'editando o que ja foi enviado'
     where id = '33333333-0000-4000-8000-000000000001'$q$,
  '42501', 'scheduled_message_not_pending',
  'agente NAO edita a agendada depois de enviada');

SELECT pg_temp.assert_negado(
  $q$insert into public.scheduled_messages (contact_id, content, message_type, scheduled_at)
     values ('22222222-0000-4000-8000-00000000000c', 'agenda para contato que nao enxerga',
             'text', now() + interval '1 hour')$q$,
  '42501', 'scheduled_message_contact_not_visible',
  'agente NAO agenda para contato que nao enxerga');

SELECT pg_temp.assert_negado(
  $q$insert into public.scheduled_messages (contact_id, content, message_type, scheduled_at, created_by)
     values ('22222222-0000-4000-8000-00000000000a', 'agenda em nome de outro',
             'text', now() + interval '1 hour', '11111111-0000-4000-8000-000000000013')$q$,
  '42501', 'row-level security',
  'agente NAO cria agendada em nome de outro perfil (created_by de terceiro)');

SELECT pg_temp.assert_negado(
  $q$update public.scheduled_messages set status = 'sent'
     where id = '33333333-0000-4000-8000-000000000001'$q$,
  '42501', 'scheduled_message_not_pending',
  'agente NAO marca enviada por conta propria');

-- pendente do agente: ele agenda, edita enquanto pendente e cancela.
SELECT pg_temp.assert_permitido(
  $q$insert into public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, created_by)
     values ('33333333-0000-4000-8000-000000000002',
             '22222222-0000-4000-8000-00000000000a', 'agendada pelo agente',
             'text', now() + interval '2 hours', '11111111-0000-4000-8000-000000000012')$q$,
  'agente agenda para contato que enxerga');

SELECT pg_temp.assert_permitido(
  $q$update public.scheduled_messages set content = 'conteudo ajustado', scheduled_at = now() + interval '3 hours'
     where id = '33333333-0000-4000-8000-000000000002'$q$,
  'agente edita conteudo e horario enquanto pendente');

SELECT pg_temp.assert_negado(
  $q$update public.scheduled_messages set created_by = '11111111-0000-4000-8000-000000000013'
     where id = '33333333-0000-4000-8000-000000000002'$q$,
  '42501', 'scheduled_message_field_not_editable',
  'agente NAO troca o dono da agendada');

-- Trocar de contato so para contato visivel (mesma linha pendente, outro contato).
SELECT pg_temp.assert_negado(
  $q$update public.scheduled_messages set contact_id = '22222222-0000-4000-8000-00000000000c'
     where id = '33333333-0000-4000-8000-000000000002'$q$,
  '42501', 'scheduled_message_contact_not_visible',
  'agente NAO move a pendente para contato que nao enxerga');

SELECT pg_temp.assert_permitido(
  $q$update public.scheduled_messages set status = 'cancelled'
     where id = '33333333-0000-4000-8000-000000000002'$q$,
  'agente cancela a propria agendada pendente');

SELECT pg_temp.assert_negado(
  $q$update public.scheduled_messages set status = 'pending'
     where id = '33333333-0000-4000-8000-000000000002'$q$,
  '42501', 'scheduled_message_not_pending',
  'agente NAO desfaz o cancelamento (cancelled e terminal para o usuario)');

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 2b. AGENTE com o contato reatribuido a outro agente DEPOIS de agendar:
--     cancelar a pendente tem de continuar valendo (o contato ja nao e visivel; a
--     visibilidade NAO entra no WITH CHECK do UPDATE de proposito, e o gatilho barra so a
--     TROCA para contato invisivel). Quem reatribui aqui e o dono do banco.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_permitido(
  $q$insert into public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, created_by)
     values ('33333333-0000-4000-8000-000000000004',
             '22222222-0000-4000-8000-00000000000a', 'cancela depois da reatribuicao',
             'text', now() + interval '2 hours', '11111111-0000-4000-8000-000000000012')$q$,
  'agente agenda a pendente que sera cancelada depois da reatribuicao');

RESET ROLE;
-- Reatribuicao da fixture: feita pelo dono do banco, sem gatilhos (o gatilho
-- prevent_contact_assignee_hijack fala de carteira de usuario e nao se aplica aqui).
SET LOCAL session_replication_role = replica;
UPDATE public.contacts SET assigned_to = '11111111-0000-4000-8000-000000000013'
  WHERE id = '22222222-0000-4000-8000-00000000000a';
SET LOCAL session_replication_role = default;
SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_negado(
  $q$insert into public.scheduled_messages (contact_id, content, message_type, scheduled_at, created_by)
     values ('22222222-0000-4000-8000-00000000000a', 'agenda depois da reatribuicao',
             'text', now() + interval '1 hour', '11111111-0000-4000-8000-000000000012')$q$,
  '42501', 'scheduled_message_contact_not_visible',
  'depois da reatribuicao o agente NAO agenda mais para o contato (visibilidade reavaliada)');

SELECT pg_temp.assert_permitido(
  $q$update public.scheduled_messages set status = 'cancelled'
     where id = '33333333-0000-4000-8000-000000000004'$q$,
  'agente AINDA cancela a pendente que criou, mesmo sem enxergar mais o contato');

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 2c. AGENTE sem a permissao send_messages: a policy de INSERT exige a permissao (e o
--     mesmo exige a migration 20261011154648). A permissao e retirada so dentro do
--     SAVEPOINT e devolvida no rollback do savepoint.
-- ---------------------------------------------------------------------------
SAVEPOINT antes_da_migration_2;

DELETE FROM public.role_permissions
 WHERE role = 'agent'
   AND permission_id = (SELECT id FROM public.permissions WHERE name = 'send_messages');

-- Contato novo, do agente, so para esta assercao (o C_VIS ja foi reatribuido em 2b).
SET LOCAL session_replication_role = replica;
INSERT INTO public.contacts (id, name, phone, conversation_status, is_lid_legacy, assigned_to, queue_id, created_at, updated_at)
VALUES ('22222222-0000-4000-8000-00000000000d', 'Prova Contato Agente 2', '+550****0004', 'open', false,
        '11111111-0000-4000-8000-000000000012', NULL, now(), now());
SET LOCAL session_replication_role = default;

SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_negado(
  $q$insert into public.scheduled_messages (contact_id, content, message_type, scheduled_at, created_by)
     values ('22222222-0000-4000-8000-00000000000d', 'agenda sem a permissao de envio',
             'text', now() + interval '1 hour', '11111111-0000-4000-8000-000000000012')$q$,
  '42501', 'row-level security',
  'agente SEM send_messages NAO agenda (permissao exigida pela policy, como na 20261011154648)');

RESET ROLE;
ROLLBACK TO SAVEPOINT antes_da_migration_2;

-- ---------------------------------------------------------------------------
-- 3. ANON
-- ---------------------------------------------------------------------------
-- anon nao tem policy de INSERT nesta tabela E o gatilho BEFORE INSERT roda antes
-- do WITH CHECK da policy: a recusa vem do gatilho (auth.uid() nulo -> nenhum
-- contato e visivel), sempre com 42501. O que se prova aqui e a RECUSA, nao o
-- texto de quem recusou.
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

SELECT pg_temp.assert_negado(
  $q$insert into public.scheduled_messages (contact_id, content, message_type, scheduled_at)
     values ('22222222-0000-4000-8000-00000000000a', 'anon agenda',
             'text', now() + interval '1 hour')$q$,
  '42501', 'scheduled_message_contact_not_visible',
  'anon NAO agenda (requisicao anonima recusada com 42501)');

-- Nota: recusa de UPDATE por RLS nao levanta erro (0 linhas afetadas) quando nao ha
-- policy de UPDATE para o papel; por isso a prova de anon e a do INSERT acima.

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 4. DESPACHANTE (service_role): transita pending -> sent / failed / expired.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;

SELECT pg_temp.assert_permitido(
  $q$insert into public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by)
     values ('33333333-0000-4000-8000-000000000003',
             '22222222-0000-4000-8000-00000000000a', 'vencida', 'text',
             now() - interval '1 minute', 'pending', '11111111-0000-4000-8000-000000000012')$q$,
  'despachante insere a linha vencida que vai transitar');

SELECT pg_temp.assert_permitido(
  $q$update public.scheduled_messages
     set status = 'sent', sent_at = now()
     where id = '33333333-0000-4000-8000-000000000003'$q$,
  'despachante transita pending -> sent (mesmo sem ser o criador)');

SELECT pg_temp.assert_permitido(
  $q$update public.scheduled_messages
     set status = 'expired', error_message = 'expirada: atraso acima de 15 min'
     where id = '33333333-0000-4000-8000-000000000001'$q$,
  'despachante transita para expired com motivo');

SELECT pg_temp.assert_permitido(
  $q$update public.scheduled_messages set status = 'failed', error_message = 'enqueue_failed'
     where id = '33333333-0000-4000-8000-000000000001'$q$,
  'despachante transita sent -> failed (reenvio pelo despachante e permitido)');

DO $blk$
DECLARE
  v_n integer;
BEGIN
  -- 28 assercoes no total: as 4 do bloco RED e a 1 do bloco 2c saem nos ROLLBACK TO
  -- SAVEPOINT (o contador e a mesma transacao), por isso o esperado aqui e 23.
  SELECT count(*) INTO v_n FROM public.prova_hz503_asserts;
  IF v_n <> 23 THEN
    RAISE EXCEPTION 'FALHOU: % assercoes registradas (esperado 23)', v_n;
  END IF;
  RAISE NOTICE 'PROVA_OK=1 -- % assercoes: 0 falhas', v_n;
END
$blk$;

ROLLBACK;
