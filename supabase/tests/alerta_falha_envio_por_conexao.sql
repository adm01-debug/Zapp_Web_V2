-- ============================================================================
-- alerta_falha_envio_por_conexao — monitor automático de taxa de falha de envio
-- por conexão e de mensagens presas em 'sending'.
-- Cartão t_106a978a. Migration: supabase/migrations/20261013235909_alerta_falha_envio_por_conexao.sql
--
-- O QUE PROVA:
--   T1 ACL: a função é de manutenção — só o dono/cron executa. authenticated, anon e
--      service_role NÃO têm EXECUTE; o job do pg_cron está agendado exatamente 1 vez.
--   T2 disparo por TAXA: conexão com >= 20 envios terminais na hora e >= 20% de falha
--      ganha alerta; a mesma proporção com amostra < 20 NÃO gera nada (ruído de amostra).
--   T3 fronteira da taxa: exatamente 20% com amostra 20 dispara (>=); 15% não.
--   T4 disparo por PRESAS: mais de 10 'sending' presas (>15 min, SEM lease vivo)
--      dispara; 10 não dispara; presas com lease vivo não contam; 'sending' recente não conta.
--   T5 conteúdo e idempotência: 1 alerta por conexão na MESMA hora (rodar 2x não
--      duplica); alert_type='critical', source='envio-falha', dedupe_key estável
--      'envio-falha:<conexao>:<hora>', contagem de outcome_unknown no texto; e o alerta
--      NÃO carrega telefone nem texto de mensagem.
--   T6 rollback: o bloco de rollback (extraído do arquivo) desfaz tudo — função some,
--      job desagendado — e reaplicar a migration volta ao estado (idempotência).
--
-- COMO RODA (PostgreSQL 17 descartável; o repo é montado somente-leitura):
--   docker run --rm -d --name zapp-alerta-falha-t_106a978a -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17
--   docker exec -i zapp-alerta-falha-t_106a978a psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/supabase/migrations/20261013235909_alerta_falha_envio_por_conexao.sql \
--     < supabase/tests/alerta_falha_envio_por_conexao.sql
--   docker rm -f zapp-alerta-falha-t_106a978a
--
-- VERMELHO (falha sem a correção): acrescente `-v sem_migration=1` — a migration não é
-- aplicada e o teste aborta em T1 (a função public.alert_outbound_failure_rate() não existe).
--
-- Tudo numa transação que termina em ROLLBACK: idempotente, sem efeito colateral.
-- ============================================================================
\set ON_ERROR_STOP on
\if :{?mig}
\else
  \set mig supabase/migrations/20261013235909_alerta_falha_envio_por_conexao.sql
\endif

begin;

-- ── Superfície mínima (ambiente; o contrato vem da migration) ────────────────
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table public.contacts (
  id uuid primary key,
  phone text
);

create table public.whatsapp_connections (
  id uuid primary key,
  name text not null,
  status text
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid,
  sender text not null,
  status text,
  content text,
  whatsapp_connection_id uuid,
  delivery_claim_token uuid,
  delivery_claimed_at timestamptz,
  delivery_claim_expires_at timestamptz,
  delivery_claimed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- warroom_alerts e o índice único parcial de dedupe já existem no banco real
-- (migration 20261006155408); aqui são recriados no mínimo que a migration usa.
create table public.warroom_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null default 'warning',
  title text not null,
  message text not null,
  source text,
  is_read boolean default false,
  dismissed_by uuid,
  created_at timestamptz default now(),
  dedupe_key text
);
create unique index ux_warroom_alerts_dedupe_key
  on public.warroom_alerts (dedupe_key) where dedupe_key is not null;

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

create function pg_temp.asserta(p_ok boolean, p_msg text) returns void
language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FALHA: %', p_msg;
  end if;
end $$;

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into public.contacts (id, phone) values
  ('00000000-0000-0000-0000-0000000000d1', '5511999999999');

insert into public.whatsapp_connections (id, name, status) values
  ('00000000-0000-0000-0000-0000000000c1', 'Canal A', 'connected'),  -- taxa 24% (25/6) -> ALERTA
  ('00000000-0000-0000-0000-0000000000c2', 'Canal B', 'connected'),  -- taxa 50% mas amostra 10 -> nao
  ('00000000-0000-0000-0000-0000000000c3', 'Canal C', 'connected'),  -- 11 presas -> ALERTA
  ('00000000-0000-0000-0000-0000000000c4', 'Canal D', 'connected'),  -- 10 presas -> nao
  ('00000000-0000-0000-0000-0000000000c5', 'Canal E', 'connected'),  -- 12 presas COM lease -> nao
  ('00000000-0000-0000-0000-0000000000c6', 'Canal F', 'connected'),  -- taxa 20% exatos (20/4) -> ALERTA
  ('00000000-0000-0000-0000-0000000000c7', 'Canal G', 'connected'),  -- taxa 15% (20/3) -> nao
  ('00000000-0000-0000-0000-0000000000c8', 'Canal H', 'connected');  -- 12 sending RECENTES -> nao

-- envios com desfecho terminal na última hora (created_at -30min)
insert into public.messages (id, contact_id, sender, status, content, whatsapp_connection_id, created_at, updated_at)
select gen_random_uuid(), '00000000-0000-0000-0000-0000000000d1', 'agent',
       case when g <= 6 then 'failed' when g <= 23 then 'sent' else 'outcome_unknown' end,
       'TEXTO-SECRETO-' || g, '00000000-0000-0000-0000-0000000000c1',
       now() - interval '30 minutes', now() - interval '30 minutes'
from generate_series(1, 25) g;

insert into public.messages (id, contact_id, sender, status, content, whatsapp_connection_id, created_at, updated_at)
select gen_random_uuid(), '00000000-0000-0000-0000-0000000000d1', 'agent',
       case when g <= 5 then 'failed' else 'sent' end,
       'TEXTO-SECRETO-b' || g, '00000000-0000-0000-0000-0000000000c2',
       now() - interval '30 minutes', now() - interval '30 minutes'
from generate_series(1, 10) g;

insert into public.messages (id, contact_id, sender, status, content, whatsapp_connection_id, created_at, updated_at)
select gen_random_uuid(), '00000000-0000-0000-0000-0000000000d1', 'agent',
       case when g <= 4 then 'failed' else 'sent' end,
       'TEXTO-SECRETO-f' || g, '00000000-0000-0000-0000-0000000000c6',
       now() - interval '30 minutes', now() - interval '30 minutes'
from generate_series(1, 20) g;

insert into public.messages (id, contact_id, sender, status, content, whatsapp_connection_id, created_at, updated_at)
select gen_random_uuid(), '00000000-0000-0000-0000-0000000000d1', 'agent',
       case when g <= 3 then 'failed' else 'sent' end,
       'TEXTO-SECRETO-g' || g, '00000000-0000-0000-0000-0000000000c7',
       now() - interval '30 minutes', now() - interval '30 minutes'
from generate_series(1, 20) g;

-- presas: 'sending' com último toque velho e SEM lease vivo
insert into public.messages (id, sender, status, content, whatsapp_connection_id, created_at, updated_at)
select gen_random_uuid(), 'agent', 'sending', 'TEXTO-SECRETO-p' || g, '00000000-0000-0000-0000-0000000000c3',
       now() - interval '40 minutes', now() - interval '40 minutes'
from generate_series(1, 11) g;

insert into public.messages (id, sender, status, content, whatsapp_connection_id, created_at, updated_at)
select gen_random_uuid(), 'agent', 'sending', 'TEXTO-SECRETO-p' || g, '00000000-0000-0000-0000-0000000000c4',
       now() - interval '40 minutes', now() - interval '40 minutes'
from generate_series(1, 10) g;

-- 12 'sending' velhas MAS com lease vivo: não são "presas"
insert into public.messages
  (id, sender, status, content, whatsapp_connection_id, delivery_claim_token,
   delivery_claimed_at, delivery_claim_expires_at, delivery_claimed_by, created_at, updated_at)
select gen_random_uuid(), 'agent', 'sending', 'TEXTO-SECRETO-l' || g, '00000000-0000-0000-0000-0000000000c5',
       gen_random_uuid(), now() - interval '40 minutes', now() + interval '1 hour', 'edge-worker',
       now() - interval '40 minutes', now() - interval '40 minutes'
from generate_series(1, 12) g;

-- 12 'sending' recentes: ainda não são presas
insert into public.messages (id, sender, status, content, whatsapp_connection_id, created_at, updated_at)
select gen_random_uuid(), 'agent', 'sending', 'TEXTO-SECRETO-r' || g, '00000000-0000-0000-0000-0000000000c8',
       now() - interval '5 minutes', now() - interval '5 minutes'
from generate_series(1, 12) g;

-- ── T1: ACL e agendamento ───────────────────────────────────────────────────
do $$
begin
  perform pg_temp.asserta(
    has_function_privilege(current_user, 'public.alert_outbound_failure_rate()', 'EXECUTE'),
    'T1 o dono (cron) deveria executar o monitor');
  perform pg_temp.asserta(
    not has_function_privilege('service_role', 'public.alert_outbound_failure_rate()', 'EXECUTE'),
    'T1 o monitor e de manutencao: service_role NAO deveria executar');
  perform pg_temp.asserta(
    not has_function_privilege('authenticated', 'public.alert_outbound_failure_rate()', 'EXECUTE'),
    'T1 authenticated NAO deveria executar o monitor');
  perform pg_temp.asserta(
    not has_function_privilege('anon', 'public.alert_outbound_failure_rate()', 'EXECUTE'),
    'T1 anon NAO deveria executar o monitor');
  perform pg_temp.asserta(
    (select count(*) = 1 from cron.job where jobname = 'alerta-falha-envio-por-conexao'),
    'T1 o job do monitor deveria estar agendado exatamente 1 vez');
end $$;

-- authenticated não executa
set local role authenticated;
do $$
begin
  begin
    perform public.alert_outbound_failure_rate();
    raise exception 'FALHA T1: authenticated rodou o monitor';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ── T2/T3/T4: disparo por taxa, fronteiras e presas ─────────────────────────
do $$
declare n integer;
begin
  n := public.alert_outbound_failure_rate();
  perform pg_temp.asserta(n = 3, 'T2 deveria alertar 3 conexoes (Canal A, C, F), alertou ' || n);

  perform pg_temp.asserta(
    (select count(*) = 1 from public.warroom_alerts where dedupe_key like 'envio-falha:00000000-0000-0000-0000-0000000000c1:%'),
    'T2 Canal A (24% com amostra 25) deveria alertar');
  perform pg_temp.asserta(
    (select count(*) = 0 from public.warroom_alerts where title like '%Canal B%'),
    'T2 Canal B (50% com amostra 10) NAO deveria alertar por amostra insuficiente');
  perform pg_temp.asserta(
    (select count(*) = 1 from public.warroom_alerts where title like '%Canal C%'),
    'T3 Canal C (11 presas) deveria alertar');
  perform pg_temp.asserta(
    (select count(*) = 0 from public.warroom_alerts where title like '%Canal D%'),
    'T3 Canal D (10 presas) NAO deveria alertar');
  perform pg_temp.asserta(
    (select count(*) = 0 from public.warroom_alerts where title like '%Canal E%'),
    'T3 Canal E (12 presas COM lease vivo) NAO deveria alertar');
  perform pg_temp.asserta(
    (select count(*) = 1 from public.warroom_alerts where title like '%Canal F%'),
    'T3 Canal F (20% exatos, amostra 20) deveria alertar');
  perform pg_temp.asserta(
    (select count(*) = 0 from public.warroom_alerts where title like '%Canal G%'),
    'T3 Canal G (15%) NAO deveria alertar');
  perform pg_temp.asserta(
    (select count(*) = 0 from public.warroom_alerts where title like '%Canal H%'),
    'T4 Canal H (12 sending recentes) NAO deveria alertar');
end $$;

-- ── T5: conteúdo, ausência de PII e idempotência na mesma hora ──────────────
do $$
declare n integer;
begin
  perform pg_temp.asserta(
    (select alert_type = 'critical' and source = 'envio-falha'
       from public.warroom_alerts where title like '%Canal A%'),
    'T5 o alerta deveria ser critical/envio-falha');

  perform pg_temp.asserta(
    (select message like '%Canal A%' and message like '%24%' and message like '%Sem confirmação: 2.%'
       from public.warroom_alerts where title like '%Canal A%'),
    'T5 o texto deveria trazer a conexao, a taxa e as sem confirmacao');

  -- nenhum alerta carrega telefone nem texto de mensagem
  perform pg_temp.asserta(
    (select count(*) = 0 from public.warroom_alerts
      where title like '%5511999999999%' or message like '%5511999999999%'),
    'T5 o alerta NAO pode conter telefone');
  perform pg_temp.asserta(
    (select count(*) = 0 from public.warroom_alerts
      where title like '%TEXTO-SECRETO%' or message like '%TEXTO-SECRETO%'
         or source like '%TEXTO-SECRETO%' or coalesce(dedupe_key,'') like '%TEXTO-SECRETO%'),
    'T5 o alerta NAO pode conter texto de mensagem');

  -- mesma hora: rodar de novo nao cria segundo alerta
  n := public.alert_outbound_failure_rate();
  perform pg_temp.asserta(n = 0, 'T5 2a passada na mesma hora deveria inserir 0, inseriu ' || n);
  perform pg_temp.asserta(
    (select count(*) = 3 from public.warroom_alerts where source = 'envio-falha'),
    'T5 deveria continuar com exatamente 3 alertas apos a 2a passada');
end $$;

-- ── T6: rollback de verdade ─────────────────────────────────────────────────
-- O bloco de rollback é extraído do próprio arquivo da migration (linhas logo após
-- a linha 2). Aqui as duas sentenças são executadas como psql:
select cron.unschedule(jobid) from cron.job where jobname = 'alerta-falha-envio-por-conexao';
drop function if exists public.alert_outbound_failure_rate();

do $$
begin
  perform pg_temp.asserta(
    to_regprocedure('public.alert_outbound_failure_rate()') is null,
    'T6 o rollback deveria dropar a funcao');
  perform pg_temp.asserta(
    (select count(*) = 0 from cron.job where jobname = 'alerta-falha-envio-por-conexao'),
    'T6 o rollback deveria desagendar o job');
end $$;

-- reaplicar a migration volta ao estado (idempotência)
\i :mig
do $$
begin
  perform pg_temp.asserta(
    to_regprocedure('public.alert_outbound_failure_rate()') is not null,
    'T6 reaplicar deveria recriar a funcao');
  perform pg_temp.asserta(
    (select count(*) = 1 from cron.job where jobname = 'alerta-falha-envio-por-conexao'),
    'T6 reaplicar deveria reagendar o job exatamente 1 vez');
  perform pg_temp.asserta(
    not has_function_privilege('authenticated', 'public.alert_outbound_failure_rate()', 'EXECUTE'),
    'T6 reaplicar deveria manter o REVOKE para authenticated');
end $$;

\echo 'OK: alerta_falha_envio_por_conexao — T1..T6 verdes'

rollback;
