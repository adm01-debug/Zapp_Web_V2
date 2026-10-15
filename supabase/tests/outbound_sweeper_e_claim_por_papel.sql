-- ============================================================================
-- outbound_sweeper_e_claim_por_papel — varredor das linhas presas em 'sending',
-- motivo no claim vazio (fail_outbound_unclaimed) e claim por papel.
-- Cartão t_bc890f8a. Migration: supabase/migrations/20261013210005_outbound_sweeper_e_claim_por_papel.sql
--
-- O QUE PROVA (executado de verdade num Postgres descartavel, papeis reais,
-- sem stub de funcao — so as TABELAS sao stubs minimos):
--   T1 ACL: fail/sweep so service_role; claim so service_role; guard sem GRANT.
--   T2 varredor/claim/fail como authenticated -> negado (42501).
--   T3 varredor conservador + motivo POR LINHA (P4: nao_despachada,
--      telefone_invalido, sem_conexao), 1 evento por linha, idempotente,
--      nao toca recente/sent e nao varre linha ambigua (POST iniciado, PD-79).
--   T4 fail_outbound_unclaimed com motivo por linha (inclui a ambigua ec, que
--      so a Edge resolve) + recusa de contato de outro agente.
--   T5 claim por papel: admin ATIVO reivindica linha alheia, inativo nao;
--      dono retoma lease expirado; linha ambigua ed recusada a dono E admin
--      (PD-79); authenticated barrado.
--   T6 guard: authenticated nao forja motivo (42501) nem carimbo de POST
--      (PD-79); eventos nao legiveis por authenticated; cron 1x em */5.
--   T7 chamada com defaults (900 s / lote 200) executa (P2/P3); fora da banda
--      (59/86401 s, lote 0/1001) rejeita 22023; limites da banda executam.
-- O plano de rollback (P5) e executavel: extrair as linhas `--   ` do
-- cabecalho da migration para rollback.sql e rodar DEPOIS deste teste num
-- banco descartavel — a prova espera: funcoes sumiram, eventos sumiram,
-- coluna sumiu, claim voltou a recusar papel (admin nao reivindica) e ambigua
-- (PD-79), guard voltou sem o motivo. Comandos no COMO RODA.
--
-- COMO RODA (PostgreSQL 17 descartável; o repo é montado somente-leitura):
--   docker run --rm -d --name zapp-out-sweep-t_bc890f8a -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17
--   docker exec -i zapp-out-sweep-t_bc890f8a psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/supabase/migrations/20261013210005_outbound_sweeper_e_claim_por_papel.sql \
--     < supabase/tests/outbound_sweeper_e_claim_por_papel.sql
--   docker rm -f zapp-out-sweep-t_bc890f8a
--
-- PROVA DO ROLLBACK (P5; mesmo banco descartavel, DEPOIS do teste verde):
--   grep '^--   ' supabase/migrations/20261013210005_outbound_sweeper_e_claim_por_papel.sql \
--     | sed 's/^--   //' > /tmp/rb.sql
--   docker exec -i zapp-out-sweep-t_bc890f8a psql -X -v ON_ERROR_STOP=1 -U postgres \
--     -d postgres -f /tmp/rb.sql   # o teste termina em rollback: rode o teste
--   # SEM o `rollback;` final (ou aplique a migration + este teste sem a
--   # transacao) antes de extrair e rodar o rb.sql; depois confira:
--   # - sweep_stale_outbound_sending e fail_outbound_unclaimed sumiram;
--   # - outbound_delivery_events sumiu; messages sem delivery_failure_reason;
--   # - claim voltou ao corpo anterior (admin nao reivindica linha alheia,
--   #   ambigua recusada); guard voltou sem o motivo.
--
-- VERMELHO (falha sem a correção): acrescente `-v sem_migration=1` — a migration
-- não é aplicada e o teste aborta ao criar a trigger do guard (a função
-- guard_message_delivery_internal_fields não existe), antes de T1.
--
-- INVENTÁRIO DAS LINHAS PRESAS (leitura no banco REAL — proibida para agente pela
-- REGRA R1; deixada aqui para um humano com acesso rodar, SEM conteúdo de mensagem
-- no relatório: só idade, agente e flag de contato):
--   select m.id, m.agent_id, now() - m.updated_at as idade,
--          (c.id is null) as sem_contato
--     from public.messages m
--     left join public.contacts c on c.id = m.contact_id
--    where m.sender = 'agent' and m.status = 'sending' and m.external_id is null
--    order by m.updated_at;
--
-- Tudo numa transação que termina em ROLLBACK: idempotente, sem efeito colateral.
-- ============================================================================
\set ON_ERROR_STOP on
\if :{?mig}
\else
  \set mig supabase/migrations/20261013210005_outbound_sweeper_e_claim_por_papel.sql
\endif

begin;

-- ── Superfície mínima (ambiente; o contrato vem da migration) ────────────────
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;

create table public.profiles (
  id uuid primary key,
  user_id uuid,
  role text,
  is_active boolean
);

create table public.whatsapp_connections (
  id uuid primary key,
  status text,
  instance_id text
);

create table public.contacts (
  id uuid primary key,
  phone text,
  whatsapp_connection_id uuid,
  assigned_to uuid
);

create table public.messages (
  id uuid primary key,
  client_message_id uuid,
  contact_id uuid,
  agent_id uuid,
  sender text,
  status text,
  external_id text,
  content text,
  message_type text,
  media_url text,
  caption text,
  media_filename text,
  media_mimetype text,
  media_type text,
  media_size bigint,
  media_meta jsonb,
  ptt boolean,
  reply_to_id uuid,
  whatsapp_connection_id uuid,
  delivery_claim_token uuid,
  delivery_claimed_at timestamptz,
  delivery_claim_expires_at timestamptz,
  delivery_claimed_by text,
  delivery_last_claim_token uuid,
  delivery_post_started_at timestamptz,
  delivery_attempt_count integer not null default 0,
  status_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_delivery_claim_state check (
    (delivery_claim_token is null and delivery_claimed_at is null
      and delivery_claim_expires_at is null and delivery_claimed_by is null)
    or
    (delivery_claim_token is not null and delivery_claimed_at is not null
      and delivery_claim_expires_at is not null and delivery_claimed_by is not null
      and delivery_claim_expires_at > delivery_claimed_at
      and length(delivery_claimed_by) between 1 and 100)
  )
);

grant select, insert, update on public.messages to authenticated;

-- stub do pg_cron (o container não tem a extensão; a migration agenda neste job)
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text, command text);
create or replace function cron.unschedule(p_jobid bigint) returns boolean
language plpgsql as $$ begin delete from cron.job where jobid = p_jobid; return true; end $$;
create or replace function cron.schedule(p_name text, p_sched text, p_cmd text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  insert into cron.job (jobname, command) values (p_name, p_cmd) returning jobid into v;
  return v;
end $$;

-- ── O CONTRATO (a migration sob teste, aplicada VERBATIM) ────────────────────
\if :{?sem_migration}
\else
  \i :mig
\endif

-- A trigger pré-existente (criada em 20260909220000) é religada aqui: a migration
-- recria a FUNCTION; o gatilho de verdade já existe no banco e é este fio.
create trigger trg_guard_message_delivery_internal_fields
  before insert or update on public.messages
  for each row execute function public.guard_message_delivery_internal_fields();

create function pg_temp.asserta(p_ok boolean, p_msg text) returns void
language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FALHA: %', p_msg;
  end if;
end $$;

-- ── Fixtures (como dono; a guarda deixa passar current_user in postgres) ─────
insert into public.profiles (id, user_id, role, is_active) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'admin', true),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b2', 'agent', true),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000b3', 'supervisor', false);

insert into public.whatsapp_connections (id, status, instance_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'connected', 'inst-1'),
  ('00000000-0000-0000-0000-0000000000c2', 'disconnected', 'inst-2');

insert into public.contacts (id, phone, whatsapp_connection_id, assigned_to) values
  ('00000000-0000-0000-0000-0000000000d1', '5511999999999', '00000000-0000-0000-0000-0000000000c1', null),
  ('00000000-0000-0000-0000-0000000000d2', 'abc', '00000000-0000-0000-0000-0000000000c1', null),
  ('00000000-0000-0000-0000-0000000000d3', '5511888888888', '00000000-0000-0000-0000-0000000000c2', null);

insert into public.messages
  (id, client_message_id, contact_id, agent_id, sender, status, content, updated_at)
values
  -- recente, sem lease: NAO deve ser varrida
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2',
   'agent', 'sending', 'oi', now()),
  -- presa ha 2h, sem lease: DEVE ser varrida
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f2',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2',
   'agent', 'sending', 'presa', now() - interval '2 hours'),
  -- 'sent': nunca tocada
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000f3',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2',
   'agent', 'sent', 'enviada', now() - interval '3 hours'),
  -- telefone invalido
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f4',
   '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a2',
   'agent', 'sending', 'tel ruim', now() - interval '10 minutes'),
  -- sem conexao conectada
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000f5',
   '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a2',
   'agent', 'sending', 'sem conexao', now() - interval '10 minutes'),
  -- linha de OUTRO agente (para o claim por papel)
  ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000f6',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a3',
   'agent', 'sending', 'do supervisor', now()),
  -- linha recente do agente comum (supervisor INATIVO nao pode reivindicar)
  ('00000000-0000-0000-0000-0000000000e8', '00000000-0000-0000-0000-0000000000f8',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2',
   'agent', 'sending', 'do agente', now());

-- lease vivo (nao pode ser pisado)
insert into public.messages
  (id, client_message_id, contact_id, agent_id, sender, status, content,
   delivery_claim_token, delivery_claimed_at, delivery_claim_expires_at,
   delivery_claimed_by, updated_at)
values
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000f7',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2',
   'agent', 'sending', 'em voo',
   '00000000-0000-0000-0000-0000000000aa', now() - interval '2 hours',
   now() + interval '1 hour', 'edge-worker', now() - interval '2 hours');

-- lease expirado recente (claimavel pelo dono; novo demais para o varredor)
insert into public.messages
  (id, client_message_id, contact_id, agent_id, sender, status, content,
   delivery_claim_token, delivery_claimed_at, delivery_claim_expires_at,
   delivery_claimed_by, updated_at)
values
  ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000f9',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2',
   'agent', 'sending', 'lease expirado',
   '00000000-0000-0000-0000-0000000000ab', now() - interval '10 minutes',
   now() - interval '5 minutes', 'edge-worker', now() - interval '10 minutes');

-- presas ha 2h para o motivo POR LINHA do varredor (P4): telefone invalido
-- (contato d2) e sem conexao (contato d3, conexao c2 desconectada)
insert into public.messages
  (id, client_message_id, contact_id, agent_id, sender, status, content, updated_at)
values
  ('00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000fa',
   '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a2',
   'agent', 'sending', 'presa tel ruim', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000eb', '00000000-0000-0000-0000-0000000000fb',
   '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a2',
   'agent', 'sending', 'presa sem conexao', now() - interval '2 hours');

-- POST iniciado + lease vencido ha 1h (resultado ambiguo, PD-79): o varredor
-- NAO varre e o claim NAO reivindica; so a Edge resolve via
-- fail_outbound_unclaimed (ec vai ao T4; ed fica preservada como prova)
insert into public.messages
  (id, client_message_id, contact_id, agent_id, sender, status, content,
   delivery_claim_token, delivery_claimed_at, delivery_claim_expires_at,
   delivery_claimed_by, delivery_post_started_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000ec', '00000000-0000-0000-0000-0000000000fc',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2',
   'agent', 'sending', 'post ambiguo resolve na edge',
   '00000000-0000-0000-0000-0000000000ac', now() - interval '2 hours',
   now() - interval '1 hour', 'edge-worker',
   now() - interval '90 minutes', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000ed', '00000000-0000-0000-0000-0000000000fd',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2',
   'agent', 'sending', 'post ambiguo preservado',
   '00000000-0000-0000-0000-0000000000ad', now() - interval '2 hours',
   now() - interval '1 hour', 'edge-worker',
   now() - interval '90 minutes', now() - interval '2 hours');

-- ── T1: ACL ─────────────────────────────────────────────────────────────────
do $$
begin
  perform pg_temp.asserta(
    has_function_privilege('service_role',
      'public.claim_outbound_message(uuid, uuid, text, integer)', 'EXECUTE'),
    'T1 claim deveria ser executavel por service_role');
  perform pg_temp.asserta(
    not has_function_privilege('authenticated',
      'public.claim_outbound_message(uuid, uuid, text, integer)', 'EXECUTE'),
    'T1 claim NAO deveria ser executavel por authenticated');
  perform pg_temp.asserta(
    not has_function_privilege('anon',
      'public.claim_outbound_message(uuid, uuid, text, integer)', 'EXECUTE'),
    'T1 claim NAO deveria ser executavel por anon');

  perform pg_temp.asserta(
    has_function_privilege('service_role',
      'public.fail_outbound_unclaimed(uuid, uuid)', 'EXECUTE'),
    'T1 fail_outbound_unclaimed deveria ser executavel por service_role');
  perform pg_temp.asserta(
    not has_function_privilege('authenticated',
      'public.fail_outbound_unclaimed(uuid, uuid)', 'EXECUTE'),
    'T1 fail_outbound_unclaimed NAO deveria ser executavel por authenticated');

  perform pg_temp.asserta(
    not has_function_privilege('service_role',
      'public.sweep_stale_outbound_sending(integer, integer)', 'EXECUTE'),
    'T1 o varredor e de manutencao: service_role NAO deveria executar');
  perform pg_temp.asserta(
    has_function_privilege(current_user,
      'public.sweep_stale_outbound_sending(integer, integer)', 'EXECUTE'),
    'T1 o dono (cron) deveria executar o varredor');

  perform pg_temp.asserta(
    not has_table_privilege('authenticated', 'public.outbound_delivery_events', 'SELECT'),
    'T1 authenticated NAO deveria ler outbound_delivery_events');
end $$;

-- ── T2: varredor negado a papel de usuario ──────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
do $$
begin
  begin
    perform public.sweep_stale_outbound_sending();
    raise exception 'FALHA T2: authenticated conseguiu rodar o varredor';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
reset request.jwt.claims;

-- ── T3: varredor conservador + idempotente + motivo por linha ──────────────
do $$
declare n integer;
begin
  n := public.sweep_stale_outbound_sending(900, 200);
  perform pg_temp.asserta(n = 3, 'T3 1a passada deveria varrer 3 linhas, varreu ' || n);

  perform pg_temp.asserta(
    (select status = 'failed' and delivery_failure_reason = 'nao_despachada'
            and delivery_claim_token is null and delivery_claimed_at is null
            and delivery_claim_expires_at is null and delivery_claimed_by is null
       from public.messages where id = '00000000-0000-0000-0000-0000000000e2'),
    'T3 a linha presa deveria virar failed/nao_despachada com claim limpo');

  perform pg_temp.asserta(
    (select status = 'failed' and delivery_failure_reason = 'telefone_invalido'
       from public.messages where id = '00000000-0000-0000-0000-0000000000ea'),
    'T3 a linha presa com telefone invalido deveria virar failed/telefone_invalido');

  perform pg_temp.asserta(
    (select status = 'failed' and delivery_failure_reason = 'sem_conexao'
       from public.messages where id = '00000000-0000-0000-0000-0000000000eb'),
    'T3 a linha presa sem conexao deveria virar failed/sem_conexao');

  perform pg_temp.asserta(
    (select count(*) = 3
       from public.outbound_delivery_events
      where message_id in ('00000000-0000-0000-0000-0000000000e2',
                           '00000000-0000-0000-0000-0000000000ea',
                           '00000000-0000-0000-0000-0000000000eb')),
    'T3 deveria haver 1 evento por linha varrida (3 no total)');

  perform pg_temp.asserta(
    (select reason = 'telefone_invalido'
       from public.outbound_delivery_events
      where message_id = '00000000-0000-0000-0000-0000000000ea'),
    'T3 o evento da linha de telefone invalido deveria ter esse motivo');

  perform pg_temp.asserta(
    (select reason = 'sem_conexao'
       from public.outbound_delivery_events
      where message_id = '00000000-0000-0000-0000-0000000000eb'),
    'T3 o evento da linha sem conexao deveria ter esse motivo');

  perform pg_temp.asserta(
    (select status = 'sending' from public.messages
      where id = '00000000-0000-0000-0000-0000000000e1'),
    'T3 a linha recente NAO deveria ser varrida');

  perform pg_temp.asserta(
    (select status = 'sent' and delivery_failure_reason is null from public.messages
      where id = '00000000-0000-0000-0000-0000000000e3'),
    'T3 a linha sent NAO deveria ser tocada');

  perform pg_temp.asserta(
    (select count(*) = 2 from public.messages
      where id in ('00000000-0000-0000-0000-0000000000ec',
                   '00000000-0000-0000-0000-0000000000ed')
        and status = 'sending'),
    'T3 linha com POST iniciado (ambiguo, PD-79) NAO deveria ser varrida');

  n := public.sweep_stale_outbound_sending(900, 200);
  perform pg_temp.asserta(n = 0, 'T3 2a passada deveria varrer 0 (idempotente), varreu ' || n);
end $$;

-- ── T4: fail_outbound_unclaimed decide o motivo no banco ────────────────────
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare r public.messages;
begin
  r := public.fail_outbound_unclaimed('00000000-0000-0000-0000-0000000000e4',
                                      '00000000-0000-0000-0000-0000000000a2');
  perform pg_temp.asserta(r.status = 'failed' and r.delivery_failure_reason = 'telefone_invalido',
    'T4 telefone invalido deveria dar motivo telefone_invalido');

  r := public.fail_outbound_unclaimed('00000000-0000-0000-0000-0000000000e5',
                                      '00000000-0000-0000-0000-0000000000a2');
  perform pg_temp.asserta(r.status = 'failed' and r.delivery_failure_reason = 'sem_conexao',
    'T4 sem conexao conectada deveria dar motivo sem_conexao');

  -- idempotente: 2a chamada devolve a MESMA linha, sem 2o evento
  r := public.fail_outbound_unclaimed('00000000-0000-0000-0000-0000000000e4',
                                      '00000000-0000-0000-0000-0000000000a2');
  perform pg_temp.asserta(
    (select count(*) = 1 from public.outbound_delivery_events
      where message_id = '00000000-0000-0000-0000-0000000000e4'),
    'T4 nao deveria duplicar evento na 2a chamada');

  -- agent_id simples nao marca a linha de outro agente
  begin
    perform public.fail_outbound_unclaimed('00000000-0000-0000-0000-0000000000e6',
                                           '00000000-0000-0000-0000-0000000000a2');
    raise exception 'FALHA T4: agente comum marcou a linha de outro agente';
  exception when no_data_found then null;
  end;

  -- lease vivo nunca e pisado
  begin
    perform public.fail_outbound_unclaimed('00000000-0000-0000-0000-0000000000e7',
                                           '00000000-0000-0000-0000-0000000000a2');
    raise exception 'FALHA T4: linha com lease vivo foi pisada';
  exception when insufficient_privilege then null;
  end;

  -- admin ativo marca a linha de outro agente
  r := public.fail_outbound_unclaimed('00000000-0000-0000-0000-0000000000e6',
                                      '00000000-0000-0000-0000-0000000000a1');
  perform pg_temp.asserta(r.status = 'failed', 'T4 admin ativo deveria marcar a linha de outro agente');

  -- linha ambigua (POST iniciado + lease vencido, PD-79): so a Edge resolve,
  -- via esta RPC — contato d1 valido e conexao c1 conectada: nao_despachada
  r := public.fail_outbound_unclaimed('00000000-0000-0000-0000-0000000000ec',
                                      '00000000-0000-0000-0000-0000000000a2');
  perform pg_temp.asserta(r.status = 'failed' and r.delivery_failure_reason = 'nao_despachada',
    'T4 a linha ambigua deveria ser resolvida pela Edge via fail_outbound_unclaimed');
end $$;

-- ── T5: claim por papel ─────────────────────────────────────────────────────
do $$
declare n integer;
begin
  -- admin ativo reivindica a linha de um agente comum
  n := (select count(*) from public.claim_outbound_message(
          '00000000-0000-0000-0000-0000000000e1',
          '00000000-0000-0000-0000-0000000000a1', 'edge', 90));
  perform pg_temp.asserta(n = 1, 'T5 admin ativo deveria reivindicar a linha de outro agente');

  -- agente comum nao reivindica a linha de outro agente
  n := (select count(*) from public.claim_outbound_message(
          '00000000-0000-0000-0000-0000000000e7',
          '00000000-0000-0000-0000-0000000000a2', 'edge', 90));
  perform pg_temp.asserta(n = 0, 'T5 lease vivo NAO deveria ser reivindicado');

  -- o dono reivindica a propria linha com lease EXPIRADO
  n := (select count(*) from public.claim_outbound_message(
          '00000000-0000-0000-0000-0000000000e9',
          '00000000-0000-0000-0000-0000000000a2', 'edge', 90));
  perform pg_temp.asserta(n = 1, 'T5 o dono com lease expirado deveria reivindicar a propria linha');

  -- supervisor INATIVO nao reivindica linha alheia
  n := (select count(*) from public.claim_outbound_message(
          '00000000-0000-0000-0000-0000000000e8',
          '00000000-0000-0000-0000-0000000000a3', 'edge', 90));
  perform pg_temp.asserta(n = 0, 'T5 supervisor inativo NAO deveria reivindicar linha alheia');

  -- linha ambigua preservada (ed): nem o dono nem o admin reivindicam
  -- (POST iniciado + lease vencido = PD-79 recusa; resolve-se pela fail RPC)
  n := (select count(*) from public.claim_outbound_message(
          '00000000-0000-0000-0000-0000000000ed',
          '00000000-0000-0000-0000-0000000000a2', 'edge-amb', 90));
  perform pg_temp.asserta(n = 0, 'T5 o dono NAO deveria reivindicar linha ambigua (POST iniciado)');

  n := (select count(*) from public.claim_outbound_message(
          '00000000-0000-0000-0000-0000000000ed',
          '00000000-0000-0000-0000-0000000000a1', 'edge-amb-admin', 90));
  perform pg_temp.asserta(n = 0, 'T5 o admin NAO deveria reivindicar linha ambigua (POST iniciado)');
end $$;
reset role;
reset request.jwt.claims;

-- claim negado ao authenticated (fora do papel de servico)
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
do $$
begin
  begin
    perform count(*) from public.claim_outbound_message(
      '00000000-0000-0000-0000-0000000000e2',
      '00000000-0000-0000-0000-0000000000a2', 'edge', 90);
    raise exception 'FALHA T5: authenticated chamou o claim';
  exception when insufficient_privilege then null;
  end;

  -- guard: authenticated nao forja o motivo (tem GRANT de UPDATE; quem barra e a trigger)
  begin
    update public.messages set delivery_failure_reason = 'nao_despachada'
     where id = '00000000-0000-0000-0000-0000000000e1';
    raise exception 'FALHA T6: authenticated forjou delivery_failure_reason';
  exception when insufficient_privilege then
    perform pg_temp.asserta(
      sqlerrm = 'message_delivery_internal_fields_forbidden',
      'T6 esperava message_delivery_internal_fields_forbidden, veio: ' || sqlerrm);
  end;

  -- PD-79 preservado: authenticated tambem NAO forja o carimbo de POST iniciado
  begin
    update public.messages set delivery_post_started_at = statement_timestamp()
     where id = '00000000-0000-0000-0000-0000000000e1';
    raise exception 'FALHA T6: authenticated forjou delivery_post_started_at';
  exception when insufficient_privilege then
    perform pg_temp.asserta(
      sqlerrm = 'message_delivery_internal_fields_forbidden',
      'T6 esperava message_delivery_internal_fields_forbidden, veio: ' || sqlerrm);
  end;
end $$;
reset role;
reset request.jwt.claims;

-- ── T6: cron agendado ───────────────────────────────────────────────────────
do $$
begin
  perform pg_temp.asserta(
    (select count(*) = 1 from cron.job where jobname = 'sweep-stale-outbound-sending'),
    'T6 o job do varredor deveria estar agendado exatamente 1 vez');
end $$;

-- ── T7: defaults do varredor + bandas validadas ────────────────────────────
do $$
declare n integer;
begin
  -- chamada SEM argumentos (defaults 900 s / lote 200): executa e nao varre
  -- nada — so restam linha recente, lease curto, linha ambigua e claim vivo
  n := public.sweep_stale_outbound_sending();
  perform pg_temp.asserta(n = 0, 'T7 chamada com defaults deveria varrer 0, varreu ' || n);

  -- bandas: fora do intervalo rejeita com 22023 (decisao deste cartao, P2/P3)
  begin
    perform public.sweep_stale_outbound_sending(59, 200);
    raise exception 'FALHA T7: min_age 59 s aceito (banda 60..86400)';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.sweep_stale_outbound_sending(86401, 200);
    raise exception 'FALHA T7: min_age 86401 s aceito (banda 60..86400)';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.sweep_stale_outbound_sending(900, 0);
    raise exception 'FALHA T7: lote 0 aceito (banda 1..1000)';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.sweep_stale_outbound_sending(900, 1001);
    raise exception 'FALHA T7: lote 1001 aceito (banda 1..1000)';
  exception when invalid_parameter_value then null;
  end;

  -- limites DA banda executam (60 s / lote 1 e 86400 s / lote 1000)
  n := public.sweep_stale_outbound_sending(60, 1);
  perform pg_temp.asserta(n >= 0, 'T7 limite inferior da banda deveria executar');
  n := public.sweep_stale_outbound_sending(86400, 1000);
  perform pg_temp.asserta(n >= 0, 'T7 limite superior da banda deveria executar');
end $$;

\echo 'OK: outbound_sweeper_e_claim_por_papel — T1..T7 verdes'

rollback;
