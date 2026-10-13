-- supabase/tests/realtime_canais_privados.sql
-- Prova de autorização Realtime por tópico — migration 20261013210002_realtime_canais_privados.sql
--
-- COMO RODAR (no banco LOCAL da tarefa, sessão como postgres; cada asserção
-- troca para o papel REAL anon/authenticated/service_role):
--   zapp-db-local psql . <conjunto> < supabase/tests/realtime_canais_privados.sql
--
-- ANTES da migration: RLS está ligada em realtime.messages e NÃO existe policy
-- nenhuma => as asserções positivas (T1/T8) falham = VERMELHO.
-- DEPOIS da migration: verde. Tudo roda numa transação que faz ROLLBACK no fim
-- (nenhuma linha, usuário ou policy fica no banco).
--
-- O que NÃO é testado aqui (limitação honesta): a Realtime só consulta RLS em
-- canal marcado `private: true` no client — isso é da trilha de telas/hooks
-- (PD-69/PD-70). Aqui se prova a REGRA de autorização por tópico (policy +
-- função) sob os papéis reais, que é o contrato que o cliente vai consumir.

\set ON_ERROR_STOP on

\echo '== fixtures sinteticas (triggers desligados; rollback no fim) =='
begin;
set local session_replication_role = replica;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

insert into public.profiles (id, user_id, name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Viewer'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Outro');

insert into public.user_roles (user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'agent'),
  ('22222222-2222-4222-8222-222222222222', 'agent');

insert into public.contacts (id, name, phone, assigned_to) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Visivel', '+555100000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Oculto',  '+555100000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.team_conversations (id, type, name) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'group', 'Equipe Minha'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'group', 'Equipe Alheia');

-- Viewer é membro só da primeira conversa de equipe.
insert into public.team_conversation_members (conversation_id, profile_id) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

-- Linhas que existiriam em realtime.messages (gravadas por postgres/BYPASSRLS).
insert into realtime.messages (topic, extension, payload, event) values
  ('typing:cccccccc-cccc-4ccc-8ccc-cccccccccccc',        'presence',  '{}'::jsonb, 'sync'),
  ('typing:dddddddd-dddd-4ddd-8ddd-dddddddddddd',        'presence',  '{}'::jsonb, 'sync'),
  ('conversation:cccccccc-cccc-4ccc-8ccc-cccccccccccc',  'presence',  '{}'::jsonb, 'sync'),
  ('team-typing-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',  'broadcast', '{}'::jsonb, 'typing'),
  ('team-presence-ffffffff-ffff-4fff-8fff-ffffffffffff','presence',  '{}'::jsonb, 'sync'),
  ('typing:nao-e-uuid',                                  'presence',  '{}'::jsonb, 'sync');

set local session_replication_role = origin;

\echo '== T1-T7: authenticated / VIEWER (ve o contato visivel; nao a equipe alheia) =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

-- Assina o canal typing do contato que ele pode ver.
select set_config('realtime.topic', 'typing:cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
do $$ begin
  if (select count(*) from realtime.messages where topic = 'typing:cccccccc-cccc-4ccc-8ccc-cccccccccccc') <> 1 then
    raise exception 'T1: viewer deveria enxergar o canal typing do contato visivel';
  end if;
  if (select count(*) from realtime.messages where topic = 'conversation:cccccccc-cccc-4ccc-8ccc-cccccccccccc') <> 1 then
    raise exception 'T2: viewer deveria enxergar o canal conversation do contato visivel';
  end if;
  if (select count(*) from realtime.messages where topic = 'typing:dddddddd-dddd-4ddd-8ddd-dddddddddddd') <> 0 then
    raise exception 'T3: viewer NAO deveria enxergar o canal do contato de outro agente';
  end if;
  if (select count(*) from realtime.messages where topic = 'team-presence-ffffffff-ffff-4fff-8fff-ffffffffffff') <> 0 then
    raise exception 'T4: viewer NAO deveria enxergar o canal da equipe alheia';
  end if;
  if (select count(*) from realtime.messages where topic = 'typing:nao-e-uuid') <> 0 then
    raise exception 'T5: topico malformado deveria ser negado';
  end if;
  if (select count(*) from realtime.messages) <> 3 then
    raise exception 'T6: viewer so pode enxergar os 3 topicos acessiveis (viu %)', (select count(*) from realtime.messages);
  end if;
end $$;
\echo '  ok T1-T6: so os topicos acessiveis'

-- Assinatura em canal que ele NAO pode acessar: a policy fecha a assinatura.
select set_config('realtime.topic', 'typing:dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
do $$ begin
  if (select count(*) from realtime.messages) <> 0 then
    raise exception 'T7a: assinatura em canal de outro agente deveria devolver 0 linhas';
  end if;
end $$;
select set_config('realtime.topic', 'team-presence-ffffffff-ffff-4fff-8fff-ffffffffffff', true);
do $$ begin
  if (select count(*) from realtime.messages) <> 0 then
    raise exception 'T7b: assinatura em canal de equipe alheia deveria devolver 0 linhas';
  end if;
end $$;
\echo '  ok T7: assinatura em canal alheio negada'

\echo '== T8-T10: authenticated / VIEWER envia broadcast =='
select set_config('realtime.topic', 'typing:cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
do $$ begin
  insert into realtime.messages (topic, extension, payload, event)
  values ('typing:cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'broadcast', '{"x":1}'::jsonb, 'typing');
end $$;
\echo '  ok T8: viewer enviou no canal do contato visivel'

select set_config('realtime.topic', 'typing:dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
do $$ begin
  begin
    insert into realtime.messages (topic, extension, payload, event)
    values ('typing:dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'broadcast', '{}'::jsonb, 'typing');
    raise exception 'T9: envio no canal de outro agente deveria ter sido negado';
  exception when insufficient_privilege then
    null;
  end;
end $$;
\echo '  ok T9: envio em canal de outro agente negado (42501)'

select set_config('realtime.topic', 'team-typing-ffffffff-ffff-4fff-8fff-ffffffffffff', true);
do $$ begin
  begin
    insert into realtime.messages (topic, extension, payload, event)
    values ('team-typing-ffffffff-ffff-4fff-8fff-ffffffffffff', 'broadcast', '{}'::jsonb, 'typing');
    raise exception 'T10: envio no canal da equipe alheia deveria ter sido negado';
  exception when insufficient_privilege then
    null;
  end;
end $$;
\echo '  ok T10: envio em canal da equipe alheia negado (42501)'

\echo '== T11-T12: authenticated / OUTRO agente (nao ve o contato do viewer) =='
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select set_config('realtime.topic', 'typing:cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
do $$ begin
  if (select count(*) from realtime.messages where topic = 'typing:cccccccc-cccc-4ccc-8ccc-cccccccccccc') <> 0 then
    raise exception 'T11: outro agente NAO deveria enxergar o canal do contato do viewer';
  end if;
  begin
    insert into realtime.messages (topic, extension, payload, event)
    values ('typing:cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'broadcast', '{"forja":true}'::jsonb, 'contact_typing');
    raise exception 'T12: outro agente NAO deveria poder forjar evento no canal do viewer';
  exception when insufficient_privilege then
    null;
  end;
end $$;
\echo '  ok T11-T12: forja do contact_typing por quem nao ve o contato negada'

\echo '== T13-T14: anon (sem JWT) fica fora de tudo =='
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('realtime.topic', 'typing:cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
do $$ begin
  if (select count(*) from realtime.messages) <> 0 then
    raise exception 'T13: anon nao deveria enxergar nenhuma linha';
  end if;
  begin
    insert into realtime.messages (topic, extension, payload, event)
    values ('typing:cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'broadcast', '{}'::jsonb, 'typing');
    raise exception 'T14: anon nao deveria poder enviar';
  exception when insufficient_privilege then
    null;
  end;
end $$;
\echo '  ok T13-T14: anon negado por padrao'

\echo '== T15-T16: service_role (BE) segue enviando (BYPASSRLS) =='
reset role;
set local role service_role;
select set_config('realtime.topic', 'typing:dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
do $$ begin
  -- 6 linhas de fixture + 1 enviada pelo viewer no T8
  if (select count(*) from realtime.messages) <> 7 then
    raise exception 'T15: service_role deveria enxergar todas as linhas (BYPASSRLS), viu %', (select count(*) from realtime.messages);
  end if;
end $$;
insert into realtime.messages (topic, extension, payload, event)
values ('typing:dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'broadcast', '{}'::jsonb, 'typing');
\echo '  ok T15-T16: service_role enxerga e envia sem depender das policies'

reset role;
rollback;

\echo '== VERDE: autorizacao Realtime por topico (typing:/conversation:/team-*) =='
