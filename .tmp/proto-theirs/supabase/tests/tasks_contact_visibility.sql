-- ============================================================================
-- Prova de autorizacao (RLS) da visibilidade de `conversation_tasks` por CONTATO
-- (cartao t_2847f048, migration 20261016030109_tasks_contact_visibility.sql).
--
-- Regra provada: tarefa LIGADA a um contato e legivel por quem enxerga aquele
-- contato (policy ADITIVA `tasks_select_contact_visible`), mas continua
-- EDITAVEL so pelo dono ou admin/supervisor (`tasks_update_own` + o gatilho
-- `trg_prevent_conversation_task_field_forgery`). Tarefa pessoal
-- (`contact_id IS NULL`) segue privada so para o dono.
--
-- ONDE RODA: no banco LOCAL da tarefa (NUNCA em producao), como `postgres` e
-- com papeis REAIS via `SET LOCAL ROLE authenticated` + claims de JWT. Como
-- `authenticated` nao tem BYPASSRLS, toda leitura passa pela RLS de verdade
-- (mesmo efeito do PostgREST).
--
-- COMANDO (a partir da raiz da copia de trabalho):
--   zapp-db-local psql . <DB_LOCAL> < supabase/tests/tasks_contact_visibility.sql
--
-- Os fixtures sao criados dentro de UMA transacao e revertidos no fim
-- (ROLLBACK): nada fica no banco. `session_replication_role = replica` entra
-- so durante os INSERTs, para dispensar linhas em `auth.users` e nao deixar os
-- gatilhos (auto_assign_to_queue_agent, trg_task_set_assignee,
-- updated_at) mexerem nos fixtures; a RLS continua valendo, porque ela nao e gatilho.
--
-- Este arquivo FALHA se a migration nao estiver aplicada: o primeiro passo exige
-- a policy `tasks_select_contact_visible` no catalogo. A prova do vermelho
-- (sem a policy, `novo` nao ve a tarefa do contato) e um comando a parte,
-- registrado no relato do cartao.
-- ============================================================================
\set ON_ERROR_STOP on

begin;

-- 0. A policy aditiva da migration PRECISA existir. Se nao existir, o teste
--    falha aqui — e nao no meio, com um resultado ambiguo.
do $guarda$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'conversation_tasks'
      and policyname = 'tasks_select_contact_visible'
      and cmd        = 'SELECT'
  ) then
    raise exception 'FALHA: a policy tasks_select_contact_visible nao existe — a migration 20261016030109_tasks_contact_visibility.sql nao foi aplicada';
  end if;
end
$guarda$;

set local session_replication_role = replica;

-- Perfis: admin, o dono/criador da tarefa (old), o NOVO responsavel pela
-- conversa transferida (new) e um terceiro agente (other).
insert into public.profiles (id, user_id, name, role, is_active) values
  ('aaaaaaa1-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Fixt Admin',  'admin', true),
  ('aaaaaaa2-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', 'Fixt Old',    'agent', true),
  ('aaaaaaa3-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003', 'Fixt New',    'agent', true),
  ('aaaaaaa4-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000004', 'Fixt Other',  'agent', true);

insert into public.user_roles (user_id, role) values
  ('11111111-0000-0000-0000-000000000001', 'admin'),
  ('11111111-0000-0000-0000-000000000002', 'agent'),
  ('11111111-0000-0000-0000-000000000003', 'agent'),
  ('11111111-0000-0000-0000-000000000004', 'agent');

-- c_transf: a conversa transferida — agora na carteira do `new`.
-- c_other : contato de outro agente.
insert into public.contacts (id, name, phone, assigned_to, queue_id) values
  ('bbbbbbb1-0000-0000-0000-000000000001', 'Fixt Contato Transferido', '+550****0001', 'aaaaaaa3-0000-0000-0000-000000000003', null),
  ('bbbbbbb2-0000-0000-0000-000000000002', 'Fixt Contato Alheio',      '+550****0002', 'aaaaaaa4-0000-0000-0000-000000000004', null);

-- Tarefas (todas 'todo' = abertas):
--   t_contato : follow-up deixado pelo `old` na conversa hoje do `new` (o que a aba
--               Tarefas precisa voltar a mostrar para o `new`).
--   t_pessoal : tarefa PESSOAL do `old` (sem contato) — segue privada.
--   t_alheia  : tarefa do `other` no contato do `other`.
insert into public.conversation_tasks (id, contact_id, title, created_by, assigned_to, status, priority) values
  ('ddddddd1-0000-0000-0000-000000000001', 'bbbbbbb1-0000-0000-0000-000000000001', 'Fixt follow-up do old', 'aaaaaaa2-0000-0000-0000-000000000002', 'aaaaaaa2-0000-0000-0000-000000000002', 'todo', 'medium'),
  ('ddddddd2-0000-0000-0000-000000000002', null,                                   'Fixt tarefa pessoal',   'aaaaaaa2-0000-0000-0000-000000000002', 'aaaaaaa2-0000-0000-0000-000000000002', 'todo', 'medium'),
  ('ddddddd3-0000-0000-0000-000000000003', 'bbbbbbb2-0000-0000-0000-000000000002', 'Fixt tarefa do other',  'aaaaaaa4-0000-0000-0000-000000000004', 'aaaaaaa4-0000-0000-0000-000000000004', 'todo', 'medium');

set local session_replication_role = default;

-- ==========================================================================
-- Sondas: exatamente as consultas que o front faz na aba Tarefas do chat
-- (useMyWorkItems.ts / mini-quadro) e a tentativa de edicao de quem so LE.
-- ==========================================================================

-- NEW (novo responsavel pela conversa transferida)
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000003","role":"authenticated"}';
select count(*) as visiveis from public.conversation_tasks
  where id in ('ddddddd1-0000-0000-0000-000000000001','ddddddd2-0000-0000-0000-000000000002','ddddddd3-0000-0000-0000-000000000003') \gset new_
select count(*) as contato from public.conversation_tasks
  where id = 'ddddddd1-0000-0000-0000-000000000001' \gset new_
select count(*) as pessoal from public.conversation_tasks
  where id = 'ddddddd2-0000-0000-0000-000000000002' \gset new_
select count(*) as alheia from public.conversation_tasks
  where id = 'ddddddd3-0000-0000-0000-000000000003' \gset new_
with upd as (
  update public.conversation_tasks set title = 'edicao indevida (new)'
  where id = 'ddddddd1-0000-0000-0000-000000000001' returning id
) select count(*) as editou_contato from upd \gset new_
with upd as (
  update public.conversation_tasks set title = 'edicao indevida (new)'
  where id = 'ddddddd2-0000-0000-0000-000000000002' returning id
) select count(*) as editou_pessoal from upd \gset new_
reset role;

-- OLD (dono/criador): o que ele ja enxergava continua igual (policy aditiva).
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000002","role":"authenticated"}';
select count(*) as visiveis from public.conversation_tasks
  where id in ('ddddddd1-0000-0000-0000-000000000001','ddddddd2-0000-0000-0000-000000000002','ddddddd3-0000-0000-0000-000000000003') \gset old_
select count(*) as contato from public.conversation_tasks
  where id = 'ddddddd1-0000-0000-0000-000000000001' \gset old_
select count(*) as pessoal from public.conversation_tasks
  where id = 'ddddddd2-0000-0000-0000-000000000002' \gset old_
select count(*) as alheia from public.conversation_tasks
  where id = 'ddddddd3-0000-0000-0000-000000000003' \gset old_
with upd as (
  update public.conversation_tasks set title = 'edicao do dono (permitida)'
  where id = 'ddddddd2-0000-0000-0000-000000000002' returning id
) select count(*) as editou_pessoal from upd \gset old_
reset role;

-- ADMIN (admin/supervisor: ve tudo, como antes)
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
select count(*) as visiveis from public.conversation_tasks
  where id in ('ddddddd1-0000-0000-0000-000000000001','ddddddd2-0000-0000-0000-000000000002','ddddddd3-0000-0000-0000-000000000003') \gset adm_
reset role;

-- ANON (sem JWT): nao le nada. A tabela tambem nao da SELECT a anon, entao a
-- leitura e capturada como negada -> 0.
do $anon$
declare v_n bigint := 0; v_gate text := 'rls_zero_rows';
begin
  set local role anon;
  begin
    execute $q$select count(*) from public.conversation_tasks
      where id in ('ddddddd1-0000-0000-0000-000000000001','ddddddd2-0000-0000-0000-000000000002','ddddddd3-0000-0000-0000-000000000003')$q$ into v_n;
  exception when insufficient_privilege then
    v_gate := 'insufficient_privilege'; v_n := 0;
  end;
  reset role;
  perform set_config('zapp.prova_anon_gate', v_gate, true);
  create temp table if not exists _anon_probe(v bigint) on commit drop;
  insert into _anon_probe values (v_n);
end
$anon$;
select v as visiveis from _anon_probe \gset anon_

-- SERVICE_ROLE (BYPASSRLS: ferramenta/cron) ve as tres, como antes.
set local role service_role;
select count(*) as visiveis from public.conversation_tasks
  where id in ('ddddddd1-0000-0000-0000-000000000001','ddddddd2-0000-0000-0000-000000000002','ddddddd3-0000-0000-0000-000000000003') \gset srv_
reset role;

-- Estado final das linhas (o `new` nao pode ter alterado o titulo da tarefa).
select count(*) as intacta from public.conversation_tasks
  where id = 'ddddddd1-0000-0000-0000-000000000001' and title = 'Fixt follow-up do old' \gset pos_
select count(*) as alterada from public.conversation_tasks
  where id = 'ddddddd2-0000-0000-0000-000000000002' and title = 'edicao do dono (permitida)' \gset pos_

-- ==========================================================================
-- Resultado e assercoes. O esperado vem da REGRA, nao das consultas acima:
--   new   : ve a tarefa do contato transferido (1) e NAO edita (0); nao ve a
--           pessoal do old nem a tarefa do other.
--   old   : continua vendo as suas duas (contato + pessoal) e edita a propria.
--   admin : ve as tres.
--   anon  : nada. service_role: as tres.
-- ==========================================================================
create temp table _res(papel text, metrica text, valor bigint) on commit drop;
insert into _res values
  ('new',          'visiveis',        :new_visiveis),
  ('new',          'contato',         :new_contato),
  ('new',          'pessoal',         :new_pessoal),
  ('new',          'alheia',          :new_alheia),
  ('new',          'editou_contato',  :new_editou_contato),
  ('new',          'editou_pessoal',  :new_editou_pessoal),
  ('old',          'visiveis',        :old_visiveis),
  ('old',          'contato',         :old_contato),
  ('old',          'pessoal',         :old_pessoal),
  ('old',          'alheia',          :old_alheia),
  ('old',          'editou_pessoal',  :old_editou_pessoal),
  ('admin',        'visiveis',        :adm_visiveis),
  ('anon',         'visiveis',        :anon_visiveis),
  ('service_role', 'visiveis',        :srv_visiveis),
  ('pos',          'contato_intacta', :pos_intacta),
  ('pos',          'pessoal_editada', :pos_alterada);

do $prova$
declare v_ok boolean; v_n int;
begin
  select count(*), bool_and(p.valor = e.valor) into v_n, v_ok
  from (values
    ('new',          'visiveis',        1::bigint),
    ('new',          'contato',         1),
    ('new',          'pessoal',         0),
    ('new',          'alheia',          0),
    ('new',          'editou_contato',  0),
    ('new',          'editou_pessoal',  0),
    ('old',          'visiveis',        2),
    ('old',          'contato',         1),
    ('old',          'pessoal',         1),
    ('old',          'alheia',          0),
    ('old',          'editou_pessoal',  1),
    ('admin',        'visiveis',        3),
    ('anon',         'visiveis',        0),
    ('service_role', 'visiveis',        3),
    ('pos',          'contato_intacta', 1),
    ('pos',          'pessoal_editada', 1)
  ) as e(papel, metrica, valor)
  join _res p using (papel, metrica);

  if not v_ok then
    raise exception 'FALHA: alguma metrica nao bateu com a regra. Resultado obtido:%',
      (select string_agg(format(E'\n  %s.%s = %s', papel, metrica, valor), '' order by papel, metrica) from _res);
  end if;

  if v_n <> 16 then
    raise exception 'FALHA: esperava casar 16 metricas, casei %', v_n;
  end if;
end
$prova$;

\echo '-- resultado (papel x metrica) --'
select papel, metrica, valor from _res order by papel, metrica;
\echo 'OK: visibilidade de tasks por contato passou'

rollback;
