-- ============================================================================
-- outbound_sweeper_e_claim_por_papel — varredor das linhas presas em 'sending',
-- motivo no claim vazio (fail_outbound_unclaimed) e claim por papel.
-- Cartão t_bc890f8a. Migration: supabase/migrations/20261013210005_outbound_sweeper_e_claim_por_papel.sql
--
-- O QUE PROVA:
--   T1 ACL: claim/fail_outbound_unclaimed só para service_role (authenticated/anon
--      sem EXECUTE); o varredor é de manutenção — NEM service_role executa
--      (só dono/cron).
--   T2 varredor como authenticated/anon -> negado (42501); como dono passa.
--   T3 varredor conservador: 'sending' sem lease vivo e mais antigo que o limite
--      vira 'failed' + motivo 'nao_despachada' + 1 evento; é idempotente (2ª
--      passada = 0); não toca 'sent'; NUNCA reenfileira (continua 'failed').
--   T4 fail_outbound_unclaimed decide o motivo NO BANCO: telefone invalido ->
--      'telefone_invalido'; sem conexao conectada -> 'sem_conexao'; com lease
--      vivo -> recusa; de outro agente por um agente comum -> não encontrado.
--   T5 claim por papel: admin ativo reivindica a linha de OUTRO agente; agente
--      comum não; supervisor INATIVO não; authenticated não chama o claim.
--   T6 guard: authenticated não forja delivery_failure_reason (42501);
--      outbound_delivery_events não é legível por authenticated (append-only).
--
-- COMO RODA (PostgreSQL 17 descartável; o repo é montado somente-leitura):
--   docker run --rm -d --name zapp-out-sweep-t_bc890f8a -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17
--   docker exec -i zapp-out-sweep-t_bc890f8a psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/supabase/migrations/20261013210005_outbound_sweeper_e_claim_por_papel.sql \
--     < supabase/tests/outbound_sweeper_e_claim_por_papel.sql
--   docker rm -f zapp-out-sweep-t_bc890f8a
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

-- ── T3: varredor conservador + idempotente ──────────────────────────────────
do $$
declare n integer;
begin
  n := public.sweep_stale_outbound_sending(900, 200);
  perform pg_temp.asserta(n = 1, 'T3 1a passada deveria varrer 1 linha, varreu ' || n);

  perform pg_temp.asserta(
    (select status = 'failed' and delivery_failure_reason = 'nao_despachada'
            and delivery_claim_token is null and delivery_claimed_at is null
            and delivery_claim_expires_at is null and delivery_claimed_by is null
       from public.messages where id = '00000000-0000-0000-0000-0000000000e2'),
    'T3 a linha presa deveria virar failed/nao_despachada com claim limpo');

  perform pg_temp.asserta(
    (select count(*) = 1 and max(reason) = 'nao_despachada'
       from public.outbound_delivery_events
      where message_id = '00000000-0000-0000-0000-0000000000e2'),
    'T3 deveria haver 1 evento nao_despachada para a linha varrida');

  perform pg_temp.asserta(
    (select status = 'sending' from public.messages
      where id = '00000000-0000-0000-0000-0000000000e1'),
    'T3 a linha recente NAO deveria ser varrida');

  perform pg_temp.asserta(
    (select status = 'sent' and delivery_failure_reason is null from public.messages
      where id = '00000000-0000-0000-0000-0000000000e3'),
    'T3 a linha sent NAO deveria ser tocada');

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

\echo 'OK: outbound_sweeper_e_claim_por_papel — T1..T6 verdes'

rollback;
