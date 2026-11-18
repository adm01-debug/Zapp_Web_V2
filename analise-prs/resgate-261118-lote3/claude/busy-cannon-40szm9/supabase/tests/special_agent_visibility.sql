-- ============================================================================
-- Prova de autorizacao por papel: o que agent, special_agent, supervisor e
-- admin leem em `profiles`, nos `contacts` atribuidos e nas metricas da Sala
-- de Crise (admin/CrisisRoom.tsx).
--
-- ONDE RODA: no banco LOCAL da tarefa (NUNCA em producao), como `postgres` e
-- com papéis REAIS via `SET LOCAL ROLE authenticated` + claims de JWT. Como
-- `authenticated` nao tem BYPASSRLS, toda leitura passa pela RLS de verdade
-- (mesmo efeito do PostgREST), coisa que os arquivos supabase/tests/*.sql
-- rodados como service_role nao conseguem provar.
--
-- COMANDO (a partir da raiz da copia de trabalho):
--   zapp-db-local psql . <DB_LOCAL> < supabase/tests/special_agent_visibility.sql
--
-- Os fixtures sao criados dentro de UMA transacao e revertidos no fim
-- (ROLLBACK): nada fica no banco. `session_replication_role = replica` entra
-- so durante os INSERTs, para dispensar linhas em `auth.users` e nao deixar os
-- gatilhos (auto_assign_to_queue_agent) mexerem no `assigned_to` dos fixtures;
-- a RLS continua valendo, porque ela nao e gatilho.
-- ============================================================================
\set ON_ERROR_STOP on

begin;

-- Resolve o nome do banco usado no comando acima (so para o relatorio).
\echo '== prova por papel: special_agent x profiles/contacts/Sala de Crise =='

set local session_replication_role = replica;

-- Fixtures (UUIDs fixos e legiveis). Perfis: admin, supervisor, agent_a,
-- agent_b e special. O papel funcional vem de `user_roles` (profiles.role so
-- admite admin/supervisor/agent; o `special_agent` vive em user_roles).
insert into public.profiles (id, user_id, name, role, is_active) values
  ('aaaaaaa1-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Fixt Admin',      'admin',      true),
  ('aaaaaaa2-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', 'Fixt Supervisor', 'supervisor', true),
  ('aaaaaaa3-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003', 'Fixt Agent A',    'agent',      true),
  ('aaaaaaa4-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000004', 'Fixt Agent B',    'agent',      true),
  ('aaaaaaa5-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000005', 'Fixt Special',    'agent',      true);

insert into public.user_roles (user_id, role) values
  ('11111111-0000-0000-0000-000000000001', 'admin'),
  ('11111111-0000-0000-0000-000000000002', 'supervisor'),
  ('11111111-0000-0000-0000-000000000003', 'agent'),
  ('11111111-0000-0000-0000-000000000004', 'agent'),
  ('11111111-0000-0000-0000-000000000005', 'agent'),
  ('11111111-0000-0000-0000-000000000005', 'special_agent');

-- O special_agent recebe visibilidade sobre a carteira do agent_a e so dela.
insert into public.agent_visibility_grants (agent_id, can_see_agent_id, granted_by) values
  ('aaaaaaa5-0000-0000-0000-000000000005', 'aaaaaaa3-0000-0000-0000-000000000003',
   'aaaaaaa1-0000-0000-0000-000000000001');

-- Contatos: cA na carteira do agent_a, cB na do agent_b, cU sem dono e sem
-- fila (queue_id nulo -> nenhum ramo de "membro da fila" entra na conta).
insert into public.contacts (id, name, phone, assigned_to, queue_id) values
  ('bbbbbbb1-0000-0000-0000-000000000001', 'Fixt Contato A', '+5500000000001',
   'aaaaaaa3-0000-0000-0000-000000000003', null),
  ('bbbbbbb2-0000-0000-0000-000000000002', 'Fixt Contato B', '+5500000000002',
   'aaaaaaa4-0000-0000-0000-000000000004', null),
  ('bbbbbbb9-0000-0000-0000-000000000009', 'Fixt Contato U', '+5500000000009',
   null, null);

-- Mensagens e SLA recentes, um por contato atendido.
insert into public.messages (id, contact_id, sender, content, created_at) values
  ('ccccccc1-0000-0000-0000-000000000001', 'bbbbbbb1-0000-0000-0000-000000000001', 'contact', 'fixt inbound A', now() - interval '10 minutes'),
  ('ccccccc2-0000-0000-0000-000000000002', 'bbbbbbb2-0000-0000-0000-000000000002', 'contact', 'fixt inbound B', now() - interval '20 minutes');

insert into public.conversation_sla (id, contact_id, first_message_at, first_response_at, first_response_breached) values
  ('ddddddd1-0000-0000-0000-000000000001', 'bbbbbbb1-0000-0000-0000-000000000001', now() - interval '2 hours', null, true),
  ('ddddddd2-0000-0000-0000-000000000002', 'bbbbbbb2-0000-0000-0000-000000000002', now() - interval '2 hours', null, true);

set local session_replication_role = default;

-- ==========================================================================
-- Sondas: exatamente as consultas que o front faz.
--   profiles  -> admin/CrisisRoom.tsx: ativos com papel de atendimento
--   contacts  -> lista de contatos (RLS por can_edit_contact)
--   msgs_*_1h -> admin/CrisisRoom.tsx: mensagens da ultima hora
--   sla       -> admin/CrisisRoom.tsx: conversas com SLA estourado
-- ==========================================================================
-- Cada bloco: assume o papel, grava as contagens em variaveis psql (\gset).
-- agent_a
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000003","role":"authenticated"}';
select count(*) from public.profiles where is_active and role in ('agent','admin','supervisor')
  and id in ('aaaaaaa1-0000-0000-0000-000000000001','aaaaaaa2-0000-0000-0000-000000000002','aaaaaaa3-0000-0000-0000-000000000003','aaaaaaa4-0000-0000-0000-000000000004','aaaaaaa5-0000-0000-0000-000000000005') \gset agent_a_profiles_
select count(*) from public.contacts where id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset agent_a_contacts_
select count(*) from public.messages where sender = 'contact' and created_at >= now() - interval '1 hour'
  and contact_id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset agent_a_msgs_in_
select count(*) from public.messages where sender = 'agent' and created_at >= now() - interval '1 hour'
  and contact_id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset agent_a_msgs_out_
select count(*) from public.conversation_sla where first_response_breached
  and contact_id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset agent_a_sla_
reset role;

-- special_agent
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000005","role":"authenticated"}';
select count(*) from public.profiles where is_active and role in ('agent','admin','supervisor')
  and id in ('aaaaaaa1-0000-0000-0000-000000000001','aaaaaaa2-0000-0000-0000-000000000002','aaaaaaa3-0000-0000-0000-000000000003','aaaaaaa4-0000-0000-0000-000000000004','aaaaaaa5-0000-0000-0000-000000000005') \gset special_profiles_
select count(*) from public.contacts where id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset special_contacts_
select count(*) from public.messages where sender = 'contact' and created_at >= now() - interval '1 hour'
  and contact_id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset special_msgs_in_
select count(*) from public.messages where sender = 'agent' and created_at >= now() - interval '1 hour'
  and contact_id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset special_msgs_out_
select count(*) from public.conversation_sla where first_response_breached
  and contact_id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset special_sla_
reset role;

-- supervisor
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000002","role":"authenticated"}';
select count(*) from public.profiles where is_active and role in ('agent','admin','supervisor')
  and id in ('aaaaaaa1-0000-0000-0000-000000000001','aaaaaaa2-0000-0000-0000-000000000002','aaaaaaa3-0000-0000-0000-000000000003','aaaaaaa4-0000-0000-0000-000000000004','aaaaaaa5-0000-0000-0000-000000000005') \gset supervisor_profiles_
select count(*) from public.contacts where id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset supervisor_contacts_
select count(*) from public.messages where sender = 'contact' and created_at >= now() - interval '1 hour'
  and contact_id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset supervisor_msgs_in_
select count(*) from public.messages where sender = 'agent' and created_at >= now() - interval '1 hour'
  and contact_id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset supervisor_msgs_out_
select count(*) from public.conversation_sla where first_response_breached
  and contact_id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset supervisor_sla_
reset role;

-- admin
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
select count(*) from public.profiles where is_active and role in ('agent','admin','supervisor')
  and id in ('aaaaaaa1-0000-0000-0000-000000000001','aaaaaaa2-0000-0000-0000-000000000002','aaaaaaa3-0000-0000-0000-000000000003','aaaaaaa4-0000-0000-0000-000000000004','aaaaaaa5-0000-0000-0000-000000000005') \gset admin_profiles_
select count(*) from public.contacts where id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset admin_contacts_
select count(*) from public.messages where sender = 'contact' and created_at >= now() - interval '1 hour'
  and contact_id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset admin_msgs_in_
select count(*) from public.messages where sender = 'agent' and created_at >= now() - interval '1 hour'
  and contact_id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset admin_msgs_out_
select count(*) from public.conversation_sla where first_response_breached
  and contact_id in ('bbbbbbb1-0000-0000-0000-000000000001','bbbbbbb2-0000-0000-0000-000000000002','bbbbbbb9-0000-0000-0000-000000000009') \gset admin_sla_
reset role;

set local session_replication_role = default;

-- ==========================================================================
-- Resultado e assercoes. O esperado vem da REGRA (acervo de docs + policies
-- canonicas), nao das consultas acima:
--   profiles : so admin/supervisor veem todos; qualquer outro ve so o proprio
--   contacts : agent -> so a propria carteira; special_agent -> proprio +
--              concedidos (so a carteira do agent_a); supervisor/admin -> tudo
--   msgs/SLA : seguem a mesma carteira visivel
-- ==========================================================================
create temp table _res(papel text, metrica text, valor bigint) on commit drop;
insert into _res values
  ('agent',       'profiles',          :agent_a_profiles_count),
  ('agent',       'contacts',          :agent_a_contacts_count),
  ('agent',       'msgs_in_1h',        :agent_a_msgs_in_count),
  ('agent',       'msgs_out_1h',       :agent_a_msgs_out_count),
  ('agent',       'sla_estourado',     :agent_a_sla_count),
  ('special_agent','profiles',         :special_profiles_count),
  ('special_agent','contacts',         :special_contacts_count),
  ('special_agent','msgs_in_1h',       :special_msgs_in_count),
  ('special_agent','msgs_out_1h',      :special_msgs_out_count),
  ('special_agent','sla_estourado',    :special_sla_count),
  ('supervisor',  'profiles',          :supervisor_profiles_count),
  ('supervisor',  'contacts',          :supervisor_contacts_count),
  ('supervisor',  'msgs_in_1h',        :supervisor_msgs_in_count),
  ('supervisor',  'msgs_out_1h',       :supervisor_msgs_out_count),
  ('supervisor',  'sla_estourado',     :supervisor_sla_count),
  ('admin',       'profiles',          :admin_profiles_count),
  ('admin',       'contacts',          :admin_contacts_count),
  ('admin',       'msgs_in_1h',        :admin_msgs_in_count),
  ('admin',       'msgs_out_1h',       :admin_msgs_out_count),
  ('admin',       'sla_estourado',     :admin_sla_count);

do $prova$
declare v_ok boolean; v_n int;
begin
  select count(*), bool_and(p.valor = e.valor) into v_n, v_ok
  from (values
    ('agent',        'profiles',       1::bigint),
    ('agent',        'contacts',       1),
    ('agent',        'msgs_in_1h',     1),
    ('agent',        'msgs_out_1h',    0),
    ('agent',        'sla_estourado',  1),
    ('special_agent','profiles',       1),   -- so o proprio perfil: a RLS de profiles nao tem policy ampla
    ('special_agent','contacts',       1),   -- proprio (sem carteira) + concedido agent_a
    ('special_agent','msgs_in_1h',     1),
    ('special_agent','msgs_out_1h',    0),
    ('special_agent','sla_estourado',  1),
    ('supervisor',   'profiles',       5),
    ('supervisor',   'contacts',       3),
    ('supervisor',   'msgs_in_1h',     2),
    ('supervisor',   'msgs_out_1h',    0),
    ('supervisor',   'sla_estourado',  2),
    ('admin',        'profiles',       5),
    ('admin',        'contacts',       3),
    ('admin',        'msgs_in_1h',     2),
    ('admin',        'msgs_out_1h',    0),
    ('admin',        'sla_estourado',  2)
  ) as e(papel, metrica, valor)
  join _res p using (papel, metrica);

  if not v_ok then
    raise exception 'FALHA: alguma metrica nao bateu com a regra. Resultado obtido:%',
      (select string_agg(format(E'\n  %s.%s = %s', papel, metrica, valor), '' order by papel, metrica) from _res);
  end if;

  -- Guarda de sanidade: todas as 20 metricas esperadas casaram com o resultado.
  if v_n <> 20 then
    raise exception 'FALHA: esperava casar 20 metricas, casei %', v_n;
  end if;
end
$prova$;

\echo '-- resultado (papel x metrica) --'
select papel, metrica, valor from _res order by papel, metrica;
\echo 'OK: prova por papel passou'

rollback;
