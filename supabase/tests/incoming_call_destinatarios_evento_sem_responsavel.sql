-- incoming_call_destinatarios_evento_sem_responsavel.sql
-- Prova de contrato da RPC public.record_incoming_call_event (migration
-- 20261014101033_incoming_call_destinatarios_sem_responsavel, cartão t_d33b0511).
--
-- Roda no banco LOCAL da tarefa como postgres (superusuário), nunca em produção:
--   zapp-db-local psql . v2-26101407060c75 -f supabase/tests/incoming_call_destinatarios_evento_sem_responsavel.sql
-- Tudo dentro de BEGIN…ROLLBACK: nenhuma fixture persiste.
--
-- O que prova (chamada `ringing` com p_should_notify = true):
--   T1  responsável explícito ONLINE: 1 notificação, para ele mesmo (comportamento de hoje);
--   T2  contato SEM responsável, fila com 2 membros ONLINE + 1 OFFLINE: uma notificação
--       por membro ONLINE e nenhuma para o OFFLINE;
--   T3  responsável OFFLINE: cai para os membros ONLINE da fila (o responsável não recebe);
--   T4  sem fila (ou fila sem ninguém ONLINE): notifica só supervisores/admins ONLINE
--       (o admin OFFLINE não recebe);
--   T5  ninguém ONLINE em lugar nenhum: nenhuma notificação, nenhum erro, chamada gravada;
--   T6  reentrega do MESMO evento não duplica (nem com 2 destinatários) — duplicate=true;
--   T7  id da notificação determinístico por (conexão, evento, usuário): ids distintos por
--       destinatário e iguais à fórmula md5;
--   T8  ACL: EXECUTE negado a anon e authenticated, concedido a service_role;
--   T9  teto de fan-out: fila com 30 membros ONLINE gera 25 notificações (corte estável).

begin;

-- ===== fixtures ==============================================================
-- auth.users cria o profile e o papel 'agent' por trigger (handle_new_user /
-- handle_new_user_role). Os ids dos profiles são lidos numa tabela temporária.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-4000-c000-000000000001', 'authenticated', 'authenticated', 'responsavel.online@test.local', '', now(), now(), now()),
  ('00000000-0000-4000-c000-000000000002', 'authenticated', 'authenticated', 'fila.membro1@test.local', '', now(), now(), now()),
  ('00000000-0000-4000-c000-000000000003', 'authenticated', 'authenticated', 'fila.membro2@test.local', '', now(), now(), now()),
  ('00000000-0000-4000-c000-000000000004', 'authenticated', 'authenticated', 'fila.membro3.offline@test.local', '', now(), now(), now()),
  ('00000000-0000-4000-c000-000000000005', 'authenticated', 'authenticated', 'supervisor.online@test.local', '', now(), now(), now()),
  ('00000000-0000-4000-c000-000000000006', 'authenticated', 'authenticated', 'admin.offline@test.local', '', now(), now(), now()),
  ('00000000-0000-4000-c000-000000000007', 'authenticated', 'authenticated', 'responsavel.offline@test.local', '', now(), now(), now());

create temp table t_ids on commit drop as
select
  (select id from public.profiles where user_id = '00000000-0000-4000-c000-000000000001') as resp_on,
  (select id from public.profiles where user_id = '00000000-0000-4000-c000-000000000002') as fila1,
  (select id from public.profiles where user_id = '00000000-0000-4000-c000-000000000003') as fila2,
  (select id from public.profiles where user_id = '00000000-0000-4000-c000-000000000004') as fila3_off,
  (select id from public.profiles where user_id = '00000000-0000-4000-c000-000000000005') as super_on,
  (select id from public.profiles where user_id = '00000000-0000-4000-c000-000000000007') as resp_off;

insert into public.user_roles (user_id, role)
values ('00000000-0000-4000-c000-000000000005', 'supervisor'),
       ('00000000-0000-4000-c000-000000000006', 'admin');

-- presença server-authoritative: só o status conta
insert into public.agent_presence (user_id, status) values
  ('00000000-0000-4000-c000-000000000001', 'online'),
  ('00000000-0000-4000-c000-000000000002', 'online'),
  ('00000000-0000-4000-c000-000000000003', 'online'),
  ('00000000-0000-4000-c000-000000000004', 'offline'),
  ('00000000-0000-4000-c000-000000000005', 'online'),
  ('00000000-0000-4000-c000-000000000006', 'offline'),
  ('00000000-0000-4000-c000-000000000007', 'offline');

insert into public.whatsapp_connections (id, name, phone_number)
values ('00000000-0000-4000-a000-000000000001', 'Canal T-d33b', '+551199****0001');

insert into public.queues (id, name) values
  ('00000000-0000-4000-9000-000000000001', 'Fila T-d33b'),
  ('00000000-0000-4000-9000-000000000003', 'Fila T-d33b sem ninguem online');

insert into public.queue_members (queue_id, profile_id, is_active) values
  ('00000000-0000-4000-9000-000000000001', (select fila1 from t_ids), true),
  ('00000000-0000-4000-9000-000000000001', (select fila2 from t_ids), true),
  ('00000000-0000-4000-9000-000000000001', (select fila3_off from t_ids), true),
  ('00000000-0000-4000-9000-000000000003', (select fila3_off from t_ids), true);

insert into public.contacts (id, name, phone, whatsapp_connection_id, assigned_to, queue_id) values
  ('00000000-0000-4000-b000-000000000001', 'Contato T1', '+5511000000001', '00000000-0000-4000-a000-000000000001', (select resp_on from t_ids),  '00000000-0000-4000-9000-000000000001'),
  ('00000000-0000-4000-b000-000000000002', 'Contato T2', '+5511000000002', '00000000-0000-4000-a000-000000000001', null,                         '00000000-0000-4000-9000-000000000001'),
  ('00000000-0000-4000-b000-000000000003', 'Contato T3', '+5511000000003', '00000000-0000-4000-a000-000000000001', (select resp_off from t_ids), '00000000-0000-4000-9000-000000000001'),
  ('00000000-0000-4000-b000-000000000004', 'Contato T4', '+5511000000004', '00000000-0000-4000-a000-000000000001', null,                         '00000000-0000-4000-9000-000000000003'),
  ('00000000-0000-4000-b000-000000000005', 'Contato T5', '+5511000000005', '00000000-0000-4000-a000-000000000001', null,                         null);

-- ===== T1: responsável explícito ONLINE ======================================
do $$
declare r record; n integer;
begin
  select * into r from public.record_incoming_call_event(
    '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001',
    'ringing', false, 'ev-t1', true, 'inbound');

  if r.call_id is null or r.notification_created is not true or r.duplicate is not false then
    raise exception 'T1 FALHOU: retorno inesperado (% / % / %)', r.call_id, r.notification_created, r.duplicate;
  end if;

  select count(*) into n from public.notifications
   where metadata->>'event_id' = 'ev-t1';
  if n <> 1 then raise exception 'T1 FALHOU: esperava 1 notificacao, veio %', n; end if;

  select count(*) into n from public.notifications
   where metadata->>'event_id' = 'ev-t1' and user_id = '00000000-0000-4000-c000-000000000001';
  if n <> 1 then raise exception 'T1 FALHOU: o responsavel online nao recebeu'; end if;
end $$;

-- ===== T2: sem responsável, fila com 2 ONLINE + 1 OFFLINE =====================
do $$
declare r record; n integer;
begin
  select * into r from public.record_incoming_call_event(
    '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001',
    'ringing', false, 'ev-t2', true, 'inbound');

  if r.duplicate is not false then raise exception 'T2 FALHOU: duplicate deveria ser false'; end if;

  select count(*) into n from public.notifications where metadata->>'event_id' = 'ev-t2';
  if n <> 2 then raise exception 'T2 FALHOU: esperava 2 notificacoes (membros ONLINE), veio %', n; end if;

  select count(*) into n from public.notifications
   where metadata->>'event_id' = 'ev-t2'
     and user_id in ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-c000-000000000003');
  if n <> 2 then raise exception 'T2 FALHOU: os membros ONLINE nao sao os 2 destinatarios'; end if;

  select count(*) into n from public.notifications
   where metadata->>'event_id' = 'ev-t2' and user_id = '00000000-0000-4000-c000-000000000004';
  if n <> 0 then raise exception 'T2 FALHOU: o membro OFFLINE recebeu notificacao'; end if;

  -- a chamada continua gravada, sem responsavel
  select count(*) into n from public.calls
   where provider_event_id = 'ev-t2' and agent_id is null and status = 'ringing';
  if n <> 1 then raise exception 'T2 FALHOU: a linha em calls nao foi gravada como hoje'; end if;
end $$;

-- ===== T7: id determinístico por (conexão, evento, usuário) ===================
do $$
declare n integer; esperado uuid;
begin
  select count(distinct id) into n from public.notifications where metadata->>'event_id' = 'ev-t2';
  if n <> 2 then raise exception 'T7 FALHOU: os 2 destinatarios deveriam ter ids distintos, veio %', n; end if;

  select md5('zapp:incoming-call:v1:00000000-0000-4000-a000-000000000001:ev-t2:00000000-0000-4000-c000-000000000002')::uuid
    into esperado;
  select count(*) into n from public.notifications where id = esperado;
  if n <> 1 then raise exception 'T7 FALHOU: id do membro1 nao e o md5(conexao:evento:usuario)'; end if;
end $$;

-- ===== T6: reentrega do mesmo evento não duplica ==============================
do $$
declare r record; n integer;
begin
  select * into r from public.record_incoming_call_event(
    '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001',
    'ringing', false, 'ev-t2', true, 'inbound');

  if r.notification_created is not false or r.duplicate is not true then
    raise exception 'T6 FALHOU: a reentrega deveria voltar created=false duplicate=true (% / %)', r.notification_created, r.duplicate;
  end if;

  select count(*) into n from public.notifications where metadata->>'event_id' = 'ev-t2';
  if n <> 2 then raise exception 'T6 FALHOU: a reentrega duplicou (agora %)', n; end if;

  select count(*) into n from public.calls where provider_event_id = 'ev-t2';
  if n <> 1 then raise exception 'T6 FALHOU: a reentrega duplicou a chamada (agora %)', n; end if;
end $$;

-- ===== T3: responsável OFFLINE cai para a fila ===============================
do $$
declare r record; n integer;
begin
  select * into r from public.record_incoming_call_event(
    '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000001',
    'ringing', false, 'ev-t3', true, 'inbound');

  if r.notification_created is not true then raise exception 'T3 FALHOU: ninguem foi notificado'; end if;

  select count(*) into n from public.notifications
   where metadata->>'event_id' = 'ev-t3'
     and user_id in ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-c000-000000000003');
  if n <> 2 then raise exception 'T3 FALHOU: os membros ONLINE da fila nao receberam (veio %)', n; end if;

  select count(*) into n from public.notifications
   where metadata->>'event_id' = 'ev-t3' and user_id = '00000000-0000-4000-c000-000000000007';
  if n <> 0 then raise exception 'T3 FALHOU: o responsavel OFFLINE recebeu'; end if;

  select count(*) into n from public.notifications
   where metadata->>'event_id' = 'ev-t3' and user_id = '00000000-0000-4000-c000-000000000004';
  if n <> 0 then raise exception 'T3 FALHOU: o membro OFFLINE da fila recebeu'; end if;
end $$;

-- ===== T4: sem ninguém ONLINE na fila => supervisão ONLINE ====================
do $$
declare r record; n integer;
begin
  select * into r from public.record_incoming_call_event(
    '00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-000000000001',
    'ringing', false, 'ev-t4', true, 'inbound');

  if r.notification_created is not true then raise exception 'T4 FALHOU: ninguem foi notificado'; end if;

  select count(*) into n from public.notifications
   where metadata->>'event_id' = 'ev-t4' and user_id = '00000000-0000-4000-c000-000000000005';
  if n <> 1 then raise exception 'T4 FALHOU: o supervisor ONLINE nao recebeu'; end if;

  select count(*) into n from public.notifications
   where metadata->>'event_id' = 'ev-t4' and user_id = '00000000-0000-4000-c000-000000000006';
  if n <> 0 then raise exception 'T4 FALHOU: o admin OFFLINE recebeu'; end if;

  -- sem fila nenhuma (contacts.queue_id nulo) o mesmo caminho vale
  perform public.record_incoming_call_event(
    '00000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-000000000001',
    'ringing', false, 'ev-t4b', true, 'inbound');
  select count(*) into n from public.notifications
   where metadata->>'event_id' = 'ev-t4b' and user_id = '00000000-0000-4000-c000-000000000005';
  if n <> 1 then raise exception 'T4 FALHOU: contato sem fila nao caiu na supervisao'; end if;
end $$;

-- ===== T5: ninguém ONLINE (nem fila, nem supervisão) =========================
update public.agent_presence set status = 'offline'
 where user_id = '00000000-0000-4000-c000-000000000005';

do $$
declare r record; n integer;
begin
  select * into r from public.record_incoming_call_event(
    '00000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-000000000001',
    'ringing', false, 'ev-t5', true, 'inbound');

  if r.call_id is null then raise exception 'T5 FALHOU: a chamada nao foi gravada'; end if;
  if r.notification_created is not false then raise exception 'T5 FALHOU: criou notificacao sem ninguem online'; end if;

  select count(*) into n from public.notifications where metadata->>'event_id' = 'ev-t5';
  if n <> 0 then raise exception 'T5 FALHOU: esperava zero notificacoes, veio %', n; end if;

  select count(*) into n from public.calls
   where provider_event_id = 'ev-t5' and status = 'ringing' and agent_id is null;
  if n <> 1 then raise exception 'T5 FALHOU: a linha em calls nao foi gravada'; end if;
end $$;

-- ===== T9: teto de fan-out por chamada (25 destinatários) ====================
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select ('00000000-0000-4000-d000-' || lpad(i::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 'cap' || i || '@test.local', '', now(), now(), now()
from generate_series(1, 30) i;

insert into public.agent_presence (user_id, status)
select id, 'online' from auth.users where email like 'cap%@test.local';

insert into public.queues (id, name)
values ('00000000-0000-4000-9000-000000000002', 'Fila T-d33b fanout');

insert into public.queue_members (queue_id, profile_id, is_active)
select '00000000-0000-4000-9000-000000000002', p.id, true
from public.profiles p
join auth.users u on u.id = p.user_id
where u.email like 'cap%@test.local';

insert into public.contacts (id, name, phone, whatsapp_connection_id, assigned_to, queue_id)
values ('00000000-0000-4000-b000-000000000006', 'Contato T9', '+5511000000006',
        '00000000-0000-4000-a000-000000000001', null, '00000000-0000-4000-9000-000000000002');

do $$
declare r record; n integer;
begin
  select * into r from public.record_incoming_call_event(
    '00000000-0000-4000-b000-000000000006', '00000000-0000-4000-a000-000000000001',
    'ringing', false, 'ev-t9', true, 'inbound');

  if r.notification_created is not true then raise exception 'T9 FALHOU: ninguem foi notificado'; end if;

  select count(*) into n from public.notifications where metadata->>'event_id' = 'ev-t9';
  if n <> 25 then raise exception 'T9 FALHOU: esperava o teto de 25 destinatarios, veio %', n; end if;

  select count(*) into n from public.notifications
   where metadata->>'event_id' = 'ev-t9'
     and user_id in (
       select id from auth.users where email like 'cap%@test.local' order by id limit 25
     );
  if n <> 25 then raise exception 'T9 FALHOU: os 25 primeiros (por user_id) nao foram os escolhidos'; end if;

  if exists (
       select 1 from public.notifications
        where metadata->>'event_id' = 'ev-t9'
          and user_id = ('00000000-0000-4000-d000-' || lpad('26', 12, '0'))::uuid
     ) then
    raise exception 'T9 FALHOU: o 26o destinatario (acima do teto) recebeu';
  end if;
end $$;

-- ===== T8: ACL — quem pode executar a RPC ====================================
do $$
begin
  if has_function_privilege('anon', 'public.record_incoming_call_event(uuid,uuid,text,boolean,text,boolean,text)', 'EXECUTE') then
    raise exception 'T8 FALHOU: anon com EXECUTE';
  end if;
  if has_function_privilege('authenticated', 'public.record_incoming_call_event(uuid,uuid,text,boolean,text,boolean,text)', 'EXECUTE') then
    raise exception 'T8 FALHOU: authenticated com EXECUTE';
  end if;
  if not has_function_privilege('service_role', 'public.record_incoming_call_event(uuid,uuid,text,boolean,text,boolean,text)', 'EXECUTE') then
    raise exception 'T8 FALHOU: service_role sem EXECUTE';
  end if;
end $$;

set local role authenticated;
do $$
begin
  begin
    perform public.record_incoming_call_event(
      '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001',
      'ringing', false, 'ev-t8', true, 'inbound');
    raise exception 'T8 FALHOU: authenticated executou a RPC (deveria ser negado)';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform public.record_incoming_call_event(
      '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001',
      'ringing', false, 'ev-t8b', true, 'inbound');
    raise exception 'T8 FALHOU: anon executou a RPC (deveria ser negado)';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- service_role executa de verdade (é ele quem roda no webhook)
set local role service_role;
do $$
declare r record;
begin
  select * into r from public.record_incoming_call_event(
    '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001',
    'ringing', false, 'ev-t8c', true, 'inbound');
  if r.call_id is null then raise exception 'T8 FALHOU: service_role nao conseguiu executar'; end if;
end $$;
reset role;

do $$ begin raise notice 'TODOS OS BLOCOS PASSARAM'; end $$;

rollback;
