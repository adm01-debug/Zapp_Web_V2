-- reassign_agents_only_open_conversations.sql
-- Prova de contrato das RPCs public.reassign_overloaded_agents e
-- public.reassign_absent_agents (migration 20261013235905, cartao de banco
-- "reassign/open conversations + dry-run").
--
-- Roda como postgres no banco local da tarefa:
--   zapp-db-local psql <copia> <conjunto> -f supabase/tests/reassign_agents_only_open_conversations.sql
-- (ou colar no psql). Tudo dentro de BEGIN…ROLLBACK: nenhuma fixture persiste.
--
-- O que prova:
--   T1  dry-run de sobrecarga devolve a CONTAGEM sem mover nem gravar evento;
--   T2  sobrecarga real move SO o excedente de conversas ABERTAS (resolvido e
--       soft-deleted nao entram na conta): 4 abertas com max_chats=2 -> 2 movidas;
--   T3  ordem = conversa em espera ha MAIS TEMPO (conversation_status_changed_at,
--       nao updated_at): move c01/c02, nao c03/c04 (que tem updated_at mais antigo);
--   T4  capacidade do substituto medida pelas ABERTAS: agente lotado de resolvidos
--       (0 abertas) RECEBE; o codigo antigo (contava tudo) nao escolheria;
--   T5  ausencia: dry-run conta, real move so as abertas do ausente;
--   T6  guarda de papel: authenticated sem admin/supervisor recebe exception;
--   T7  entrada invalida: inactive_minutes negativo -> SQLSTATE 22023;
--   T8  ATOMICIDADE: se o INSERT do evento falhar, nada e movido;
--   T9  ACL: EXECUTE para authenticated/service_role, negado a anon/PUBLIC.
--   T10 updated_at so muda nas linhas movidas.
--   R0  re-isolamento (max_chats NULL) apos T4/T10 para os blocos R.
--   R1  dry-run == real com vaga limitada (contador de simulacao): 2
--       excedentes e 1 vaga -> 1 e 1; sem o contador o ensaio diria 2.
--   R2  borda: 3 abertas + 40 resolvidas com max_chats=3 NAO sobrecarrega (0);
--       max_chats NULL com 10 abertas e ignorado (NULL ajustado no bloco).
--   R3  guarda de papel tambem em reassign_overloaded_agents (comum negado).
--   R4  ausente com contato apagado: move a aberta valida, apagada fica.

begin;

-- ===== neutraliza o seed local (isolamento das contagens) ====================
-- O banco local vem semeado com agentes e conversas. Para que as CONTAGENS
-- devolvidas pelas RPCs reflitam so as fixtures deste teste, tiramos do seed a
-- chance de ser sobrecarregado (max_chats NULL = sem teto) e de ser ausente
-- (sessao recente para todo profile pre-existente). Tudo dentro do BEGIN…ROLLBACK.
update public.profiles set max_chats = null;
insert into public.user_sessions (id, user_id, is_active, started_at, last_activity_at, expires_at)
select gen_random_uuid(), p.user_id, true, now(), now(), now() + interval '1 day'
from public.profiles p;

-- ===== fixtures ==============================================================
-- 5 usuarios: admin (executor), sobrecarregado, ausente, livre, cheio-fora.
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'admin.rc@test.local',  '', now(), now()),
  ('00000000-0000-0000-0000-00000000b001', 'authenticated', 'authenticated', 'over.rc@test.local',   '', now(), now()),
  ('00000000-0000-0000-0000-00000000b002', 'authenticated', 'authenticated', 'absent.rc@test.local', '', now(), now()),
  ('00000000-0000-0000-0000-00000000b003', 'authenticated', 'authenticated', 'free.rc@test.local',   '', now(), now()),
  ('00000000-0000-0000-0000-00000000b004', 'authenticated', 'authenticated', 'full.rc@test.local',   '', now(), now());

-- handle_new_user cria o profile de cada auth.users; guardamos os ids.
create temp table rc_ids on commit drop as
select
  (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000a001') as admin_p,
  (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000b001') as over_p,
  (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000b002') as absent_p,
  (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000b003') as free_p,
  (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000b004') as full_p;

insert into public.user_roles (user_id, role)
values ('00000000-0000-0000-0000-00000000a001', 'admin');

update public.profiles set max_chats = 2  where id = (select over_p   from rc_ids);
update public.profiles set max_chats = 10 where id = (select absent_p from rc_ids);
update public.profiles set max_chats = 5  where id = (select free_p   from rc_ids);
update public.profiles set max_chats = 1  where id = (select full_p   from rc_ids);

insert into public.queues (id, name, color)
values ('00000000-0000-0000-0000-00000000d001', 'Fila RC', '#22c55e');

-- O ausente NAO entra como membro de fila: fica so como REMETENTE da T5, para
-- que o unico candidato da sobrecarga seja o agente livre (movimento deterministico).
insert into public.queue_members (queue_id, profile_id, is_active)
values
  ('00000000-0000-0000-0000-00000000d001', (select over_p   from rc_ids), true),
  ('00000000-0000-0000-0000-00000000d001', (select free_p   from rc_ids), true),
  ('00000000-0000-0000-0000-00000000d001', (select full_p   from rc_ids), true);

-- Sessoes recentes para TODOS menos o ausente: so o ausente entra na T5.
insert into public.user_sessions (id, user_id, is_active, started_at, last_activity_at, expires_at)
values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000a001', true, now(), now(), now() + interval '1 day'),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000b001', true, now(), now(), now() + interval '1 day'),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000b003', true, now(), now(), now() + interval '1 day'),
  ('00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-00000000b004', true, now(), now(), now() + interval '1 day');

-- Contatos do sobrecarregado (max_chats=2): 4 ABERTAS + 1 resolvida + 1 soft-deleted.
-- c03/c04 tem updated_at MAIS ANTIGO que c01/c02 — se a ordem fosse updated_at,
-- elas e que seriam movidas (a prova viva da T3).
insert into public.contacts (id, name, phone, conversation_status, assigned_to, queue_id, conversation_status_changed_at, updated_at, deleted_at)
values
  ('00000000-0000-0000-0000-00000000c001', 'Over c01', '+551****0001', 'open',     (select over_p from rc_ids), '00000000-0000-0000-0000-00000000d001', now() - interval '100 minutes', now(),                    null),
  ('00000000-0000-0000-0000-00000000c002', 'Over c02', '+551****0002', 'open',     (select over_p from rc_ids), '00000000-0000-0000-0000-00000000d001', now() - interval '90 minutes',  now(),                    null),
  ('00000000-0000-0000-0000-00000000c003', 'Over c03', '+551****0003', 'open',     (select over_p from rc_ids), '00000000-0000-0000-0000-00000000d001', now() - interval '80 minutes',  now() - interval '500 minutes', null),
  ('00000000-0000-0000-0000-00000000c004', 'Over c04', '+551****0004', 'open',     (select over_p from rc_ids), '00000000-0000-0000-0000-00000000d001', now() - interval '70 minutes',  now() - interval '600 minutes', null),
  ('00000000-0000-0000-0000-00000000c005', 'Over c05', '+551****0005', 'resolved', (select over_p from rc_ids), '00000000-0000-0000-0000-00000000d001', now() - interval '110 minutes', now(),                    null),
  ('00000000-0000-0000-0000-00000000c006', 'Over c06', '+551****0006', 'open',     (select over_p from rc_ids), '00000000-0000-0000-0000-00000000d001', now() - interval '120 minutes', now(),                    now());

-- Contatos do ausente: 1 aberta (movel) + 1 resolvida (nao entra).
insert into public.contacts (id, name, phone, conversation_status, assigned_to, queue_id, conversation_status_changed_at)
values
  ('00000000-0000-0000-0000-00000000c007', 'Absent c07', '+551****0007', 'open',     (select absent_p from rc_ids), '00000000-0000-0000-0000-00000000d001', now() - interval '60 minutes'),
  ('00000000-0000-0000-0000-00000000c008', 'Absent c08', '+551****0008', 'resolved', (select absent_p from rc_ids), '00000000-0000-0000-0000-00000000d001', now() - interval '50 minutes');

-- Contato do cheio: 1 aberta com max_chats=1 -> nunca recebe nem fica sobrecarregado.
insert into public.contacts (id, name, phone, conversation_status, assigned_to, queue_id, conversation_status_changed_at)
values
  ('00000000-0000-0000-0000-00000000c009', 'Full c09', '+551****0009', 'open', (select full_p from rc_ids), '00000000-0000-0000-0000-00000000d001', now() - interval '40 minutes');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
-- Compat: GoTrue antigo le auth.uid() de request.jwt.claim.sub (singular);
-- o novo ignora essa GUC e usa o JSON acima. Espelhar o sub nos dois.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';

-- ===== T1: dry-run de sobrecarga conta sem mover e sem gravar =================
do $$
declare
  v_n integer;
  v_before integer;
  v_after  integer;
  v_moved  integer;
begin
  select count(*) into v_before from public.conversation_events where event_type = 'overload_reassign';
  v_n := public.reassign_overloaded_agents(true);
  if v_n <> 2 then
    raise exception 'T1 FALHOU: dry-run deveria contar 2 (excedente de abertas), veio %', v_n;
  end if;
  select count(*) into v_after from public.conversation_events where event_type = 'overload_reassign';
  if v_after <> v_before then
    raise exception 'T1 FALHOU: dry-run gravou evento (% -> %)', v_before, v_after;
  end if;
  select count(*) into v_moved from public.contacts
   where id in ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-00000000c002')
     and assigned_to = (select over_p from rc_ids);
  if v_moved <> 2 then
    raise exception 'T1 FALHOU: dry-run moveu contato';
  end if;
  raise notice 'T1 OK: dry-run devolveu 2 sem mover nem gravar evento';
end $$;

-- ===== T2: sobrecarga real move SO o excedente de ABERTAS ====================
do $$
declare
  v_n integer;
  v_free integer;
  v_res  integer;
  v_del  integer;
begin
  v_n := public.reassign_overloaded_agents(false);
  if v_n <> 2 then
    raise exception 'T2 FALHOU: deveria mover 2 (4 abertas - max 2), veio %', v_n;
  end if;
  select count(*) into v_free from public.contacts
   where assigned_to = (select free_p from rc_ids) and conversation_status = 'open' and deleted_at is null;
  if v_free <> 2 then
    raise exception 'T2 FALHOU: o substituto livre deveria receber 2, recebeu %', v_free;
  end if;
  -- resolvida (c05) e soft-deleted (c06) permanecem no dono original.
  select count(*) into v_res from public.contacts
   where id = '00000000-0000-0000-0000-00000000c005' and assigned_to = (select over_p from rc_ids);
  select count(*) into v_del from public.contacts
   where id = '00000000-0000-0000-0000-00000000c006' and assigned_to = (select over_p from rc_ids);
  if v_res <> 1 or v_del <> 1 then
    raise exception 'T2 FALHOU: resolvida/soft-deleted foram movidas (res=%, del=%)', v_res, v_del;
  end if;
  raise notice 'T2 OK: 2 abertas movidas, resolvida e soft-deleted intactas';
end $$;

-- ===== T3: ordem = conversa em espera ha mais tempo (nao updated_at) =========
do $$
declare
  v_ok integer;
begin
  select count(*) into v_ok from public.contacts
   where assigned_to = (select free_p from rc_ids)
     and id in ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-00000000c002');
  if v_ok <> 2 then
    raise exception 'T3 FALHOU: as 2 mais antigas em espera (c01/c02) deveriam ter sido movidas, movidas=%', v_ok;
  end if;
  select count(*) into v_ok from public.contacts
   where assigned_to = (select over_p from rc_ids)
     and id in ('00000000-0000-0000-0000-00000000c003','00000000-0000-0000-0000-00000000c004');
  if v_ok <> 2 then
    raise exception 'T3 FALHOU: c03/c04 (updated_at mais antigo) nao deveriam ser movidas';
  end if;
  raise notice 'T3 OK: ordem por conversa em espera ha mais tempo, ignora updated_at';
end $$;

-- ===== T5: ausencia (dry-run conta, real move so as abertas) =================
do $$
declare
  v_dry integer;
  v_n   integer;
  v_ok  integer;
begin
  v_dry := public.reassign_absent_agents(30, true);
  if v_dry <> 1 then
    raise exception 'T5 FALHOU: dry-run da ausencia deveria contar 1 (so a aberta), veio %', v_dry;
  end if;
  select count(*) into v_ok from public.contacts
   where id = '00000000-0000-0000-0000-00000000c007' and assigned_to = (select absent_p from rc_ids);
  if v_ok <> 1 then
    raise exception 'T5 FALHOU: dry-run da ausencia moveu contato';
  end if;

  v_n := public.reassign_absent_agents(30, false);
  if v_n <> 1 then
    raise exception 'T5 FALHOU: ausencia real deveria mover 1, veio %', v_n;
  end if;
  select count(*) into v_ok from public.contacts
   where id = '00000000-0000-0000-0000-00000000c007' and assigned_to = (select free_p from rc_ids);
  if v_ok <> 1 then
    raise exception 'T5 FALHOU: c07 nao foi para o substituto livre';
  end if;
  select count(*) into v_ok from public.contacts
   where id = '00000000-0000-0000-0000-00000000c008' and conversation_status = 'resolved'
     and assigned_to = (select absent_p from rc_ids);
  if v_ok <> 1 then
    raise exception 'T5 FALHOU: a resolvida do ausente (c08) foi movida';
  end if;
  raise notice 'T5 OK: ausencia move so as abertas; dry-run nao move';
end $$;

-- ===== T4: capacidade do substituto medida pelas ABERTAS =====================
-- Fila propria: X esta lotado de RESOLVIDOS (3 resolvidos, 0 abertas) e mesmo
-- assim RECEBE; o codigo antigo contava tudo e excluia X -> 0 movidos.
do $$
declare
  v_n  integer;
  v_ok integer;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-00000000f001', 'authenticated', 'authenticated', 'x.rc@test.local', '', now(), now()),
    ('00000000-0000-0000-0000-00000000f002', 'authenticated', 'authenticated', 'y.rc@test.local', '', now(), now());

  insert into public.queues (id, name, color)
  values ('00000000-0000-0000-0000-00000000d002', 'Fila RC2', '#3b82f6');

  insert into public.queue_members (queue_id, profile_id, is_active)
  select '00000000-0000-0000-0000-00000000d002', p.id, true
  from public.profiles p where p.user_id in ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-00000000f002');

  update public.profiles set max_chats = 3 where user_id = '00000000-0000-0000-0000-00000000f001';
  update public.profiles set max_chats = 2 where user_id = '00000000-0000-0000-0000-00000000f002';

  -- X: 3 resolvidos (0 abertas). Y: 3 abertas (excedente 1).
  insert into public.contacts (id, name, phone, conversation_status, assigned_to, queue_id, conversation_status_changed_at)
  values
    ('00000000-0000-0000-0000-00000000a101', 'X r1', '+5511****101', 'resolved', (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000f001'), '00000000-0000-0000-0000-00000000d002', now() - interval '30 minutes'),
    ('00000000-0000-0000-0000-00000000a102', 'X r2', '+5511****102', 'resolved', (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000f001'), '00000000-0000-0000-0000-00000000d002', now() - interval '29 minutes'),
    ('00000000-0000-0000-0000-00000000a103', 'X r3', '+5511****103', 'resolved', (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000f001'), '00000000-0000-0000-0000-00000000d002', now() - interval '28 minutes'),
    ('00000000-0000-0000-0000-00000000a201', 'Y o1', '+5511****201', 'open',     (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000f002'), '00000000-0000-0000-0000-00000000d002', now() - interval '20 minutes'),
    ('00000000-0000-0000-0000-00000000a202', 'Y o2', '+5511****202', 'open',     (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000f002'), '00000000-0000-0000-0000-00000000d002', now() - interval '19 minutes'),
    ('00000000-0000-0000-0000-00000000a203', 'Y o3', '+5511****203', 'open',     (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000f002'), '00000000-0000-0000-0000-00000000d002', now() - interval '18 minutes');

  v_n := public.reassign_overloaded_agents(false);
  if v_n < 1 then
    raise exception 'T4 FALHOU: deveria mover ao menos 1 do sobrecarregado Y, veio %', v_n;
  end if;
  select count(*) into v_ok from public.contacts
   where id = '00000000-0000-0000-0000-00000000a201'
     and assigned_to = (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000f001');
  if v_ok <> 1 then
    raise exception 'T4 FALHOU: o substituto lotado de resolvidos (0 abertas) nao recebeu';
  end if;
  raise notice 'T4 OK: capacidade medida pelas abertas (lotado de resolvidos ainda recebe)';
end $$;

-- ===== T6: guarda de papel ==================================================
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000b001';
  begin
    perform public.reassign_absent_agents(30, false);
    raise exception 'T6 FALHOU: agente comum executou a RPC';
  exception when others then
    if sqlerrm like '%T6 FALHOU%' then raise; end if;
    raise notice 'T6: rejeitado como esperado: %', sqlerrm;
  end;
  raise notice 'T6 OK: authenticated sem admin/supervisor negado';
end $$;

-- ===== T7: entrada invalida =================================================
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
-- Compat: GoTrue antigo le auth.uid() de request.jwt.claim.sub (singular);
-- o novo ignora essa GUC e usa o JSON acima. Espelhar o sub nos dois.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';
  begin
    perform public.reassign_absent_agents(-5, false);
    raise exception 'T7 FALHOU: minuto negativo passou';
  exception when others then
    if sqlerrm like '%T7 FALHOU%' then raise; end if;
    if sqlstate <> '22023' then
      raise exception 'T7 FALHOU: esperava SQLSTATE 22023, veio % (%)', sqlstate, sqlerrm;
    end if;
  end;
  raise notice 'T7 OK: inactive_minutes negativo rejeitado com 22023';
end $$;

-- ===== T8: ATOMICIDADE — evento falha => nada e movido =======================
-- Repoe o estado original de c01/c02 e instala um gatilho que sempre falha o
-- INSERT do evento: a excecao tem que desfazer o UPDATE junto.
update public.contacts
   set assigned_to = (select over_p from rc_ids)
 where id in ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-00000000c002');
delete from public.conversation_events
 where contact_id in ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-00000000c002');

create or replace function pg_temp.rc_fail_event_insert()
returns trigger language plpgsql as $f$
begin
  raise exception 'falha forcada no insert do evento (teste T8)';
end;
$f$;

create trigger trg_rc_fail_event
  before insert on public.conversation_events
  for each row execute function pg_temp.rc_fail_event_insert();

do $$
declare
  v_ok integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
-- Compat: GoTrue antigo le auth.uid() de request.jwt.claim.sub (singular);
-- o novo ignora essa GUC e usa o JSON acima. Espelhar o sub nos dois.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';
  begin
    perform public.reassign_overloaded_agents(false);
    raise exception 'T8 FALHOU: RPC passou com o evento quebrado';
  exception when others then
    if sqlerrm like '%T8 FALHOU%' then raise; end if;
  end;
  select count(*) into v_ok from public.contacts
   where id = '00000000-0000-0000-0000-00000000c001' and assigned_to = (select over_p from rc_ids);
  if v_ok <> 1 then
    raise exception 'T8 FALHOU: o UPDATE persistiu sem o evento (nao foi atomico)';
  end if;
  raise notice 'T8 OK: falha no evento desfez o movimento (atomico)';
end $$;

drop trigger trg_rc_fail_event on public.conversation_events;

-- ===== T9: ACL ==============================================================
do $$
begin
  if has_function_privilege('anon', 'public.reassign_overloaded_agents(boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.reassign_absent_agents(integer,boolean)', 'EXECUTE')
     or exists (
       select 1 from pg_proc p, aclexplode(p.proacl) g
        where p.oid in ('public.reassign_overloaded_agents(boolean)'::regprocedure,
                        'public.reassign_absent_agents(integer,boolean)'::regprocedure)
          and g.grantee = 0
     ) then
    raise exception 'T9 FALHOU: EXECUTE aberto para anon/PUBLIC';
  end if;
  if not has_function_privilege('authenticated', 'public.reassign_overloaded_agents(boolean)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.reassign_overloaded_agents(boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.reassign_absent_agents(integer,boolean)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.reassign_absent_agents(integer,boolean)', 'EXECUTE') then
    raise exception 'T9 FALHOU: EXECUTE faltando para authenticated/service_role';
  end if;
  -- A assinatura antiga nao pode coexistir com a nova (chamada sem args viraria ambigua).
  if to_regprocedure('public.reassign_overloaded_agents()') is not null
     or to_regprocedure('public.reassign_absent_agents(integer)') is not null then
    raise exception 'T9 FALHOU: assinatura antiga ainda existe (ambiguidade de chamada)';
  end if;
  raise notice 'T9 OK: EXECUTE so para authenticated + service_role; assinatura antiga removida';
end $$;

-- ===== T10: updated_at so muda nas movidas (linha antes/depois) =============
-- O UPDATE em contacts dispara update_contacts_updated_at (BEFORE UPDATE). Aqui
-- provamos que ele regrava SO as linhas movidas: uma movida muda a data; uma
-- resolvida da MESMA agente e um contato de OUTRA agente ficam intactos.
do $$
declare
  v_queue uuid := '00000000-0000-0000-0000-00000000d003';
  v_m uuid; v_n uuid;
  v_before_m timestamptz; v_before_r timestamptz; v_before_o timestamptz;
  v_after_m timestamptz; v_after_r timestamptz; v_after_o timestamptz;
  v_n_moved integer;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
  values ('00000000-0000-0000-0000-00000000f003','authenticated','authenticated','m@t.local','x',now(),now()),
         ('00000000-0000-0000-0000-00000000f004','authenticated','authenticated','n@t.local','x',now(),now());
  select id into v_m from public.profiles where user_id='00000000-0000-0000-0000-00000000f003';
  select id into v_n from public.profiles where user_id='00000000-0000-0000-0000-00000000f004';
  update public.profiles set max_chats=1 where id=v_m;
  update public.profiles set max_chats=5 where id=v_n;
  insert into public.queues (id,name,color) values (v_queue,'Fila upd','#000000');
  insert into public.queue_members (queue_id,profile_id,is_active) values (v_queue,v_m,true),(v_queue,v_n,true);
  insert into public.contacts (id,name,phone,conversation_status,assigned_to,queue_id,conversation_status_changed_at,updated_at)
  values
    ('00000000-0000-0000-0000-00000000b101','m1','+5511****401','open',v_m,v_queue, now()-interval '50 minutes', now()-interval '1 hour'),
    ('00000000-0000-0000-0000-00000000b102','m2','+5511****402','open',v_m,v_queue, now()-interval '49 minutes', now()-interval '1 hour'),
    ('00000000-0000-0000-0000-00000000b103','r1','+5511****403','resolved',v_m,v_queue, now()-interval '51 minutes', now()-interval '1 hour'),
    ('00000000-0000-0000-0000-00000000b104','o1','+5511****404','open',v_n,v_queue, now()-interval '40 minutes', now()-interval '1 hour');
  select updated_at into v_before_m from public.contacts where id='00000000-0000-0000-0000-00000000b101';
  select updated_at into v_before_r from public.contacts where id='00000000-0000-0000-0000-00000000b103';
  select updated_at into v_before_o from public.contacts where id='00000000-0000-0000-0000-00000000b104';
  v_n_moved := public.reassign_overloaded_agents(false);
  if (select assigned_to from public.contacts where id='00000000-0000-0000-0000-00000000b101') is distinct from v_n then
    raise exception 'T10 FALHOU: a aberta mais antiga de M nao foi para N';
  end if;
  select updated_at into v_after_m from public.contacts where id='00000000-0000-0000-0000-00000000b101';
  select updated_at into v_after_r from public.contacts where id='00000000-0000-0000-0000-00000000b103';
  select updated_at into v_after_o from public.contacts where id='00000000-0000-0000-0000-00000000b104';
  if v_after_m <= v_before_m then raise exception 'T10 FALHOU: movida nao teve updated_at atualizado'; end if;
  if v_after_r <> v_before_r then raise exception 'T10 FALHOU: resolvida (nao movida) teve updated_at mexido'; end if;
  if v_after_o <> v_before_o then raise exception 'T10 FALHOU: contato de outra agente mexido'; end if;
  raise notice 'T10 OK: updated_at so nas movidas; vizinhas intactas';
end $$;

-- ===== R0: re-isolamento para os blocos R (rodam depois de T1..T10) ==========
-- T4/T10 deixaram agentes com max_chats finito; sem isto eles poluiriam as
-- contagens globais dos blocos R. Os agentes novos (R1/R2/R4) ainda nao
-- existem aqui: cada bloco ajusta o proprio max_chats apos criar os usuarios.
update public.profiles set max_chats = null;

-- ===== R2: borda (3 abertas + max 3 NAO e sobrecarga) e NULL ignorado ======
-- (a) agente no limite exato: 3 abertas + 40 resolvidas, max_chats=3 -> 0.
-- (b) max_chats NULL com 10 abertas e ignorado; o NULL e ajustado AQUI
-- (explicito), sem depender da neutralizacao do topo do arquivo.
do $$
declare
  v_a uuid; v_n2 uuid;
  v_ret integer; v_open_a integer; v_open_n2 integer;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
  values ('00000000-0000-0000-0000-00000000f009','authenticated','authenticated','a@t.local','x',now(),now()),
         ('00000000-0000-0000-0000-00000000f010','authenticated','authenticated','n2@t.local','x',now(),now());
  select id into v_a from public.profiles where user_id='00000000-0000-0000-0000-00000000f009';
  select id into v_n2 from public.profiles where user_id='00000000-0000-0000-0000-00000000f010';
  update public.profiles set max_chats = 3 where id = v_a;
  update public.profiles set max_chats = null where id = v_n2;
  if (select max_chats from public.profiles where id = v_n2) is not null then
    raise exception 'R2 FALHOU: max_chats de N2 nao ficou NULL';
  end if;
  insert into public.user_sessions (id, user_id, is_active, started_at, last_activity_at, expires_at)
  values ('00000000-0000-0000-0000-00000000e101','00000000-0000-0000-0000-00000000f009',true,now(),now(),now()+interval '1 day'),
         ('00000000-0000-0000-0000-00000000e102','00000000-0000-0000-0000-00000000f010',true,now(),now(),now()+interval '1 day');
  insert into public.contacts (id, name, phone, conversation_status, assigned_to, conversation_status_changed_at)
  values
    ('00000000-0000-0000-0000-00000000b221','A o1','+5511****901','open',v_a, now()-interval '30 minutes'),
    ('00000000-0000-0000-0000-00000000b222','A o2','+5511****902','open',v_a, now()-interval '29 minutes'),
    ('00000000-0000-0000-0000-00000000b223','A o3','+5511****903','open',v_a, now()-interval '28 minutes');
  insert into public.contacts (id, name, phone, conversation_status, assigned_to, conversation_status_changed_at)
  select gen_random_uuid(), 'A res '||g, '+5511****9'||lpad((100+g)::text,3,'0'), 'resolved', v_a, now()-(g||' minutes')::interval
  from generate_series(1,40) g;
  insert into public.contacts (id, name, phone, conversation_status, assigned_to, conversation_status_changed_at)
  select gen_random_uuid(), 'N2 o '||g, '+5511****8'||lpad((100+g)::text,3,'0'), 'open', v_n2, now()-(g||' minutes')::interval
  from generate_series(1,10) g;

  v_ret := public.reassign_overloaded_agents(false);
  if v_ret <> 0 then
    raise exception 'R2 FALHOU: borda (3/3) + NULL deveriam dar 0, veio %', v_ret;
  end if;
  select count(*) into v_open_a from public.contacts where assigned_to=v_a and conversation_status='open' and deleted_at is null;
  select count(*) into v_open_n2 from public.contacts where assigned_to=v_n2 and conversation_status='open' and deleted_at is null;
  if v_open_a <> 3 then raise exception 'R2 FALHOU: A deveria manter 3 abertas, tem %', v_open_a; end if;
  if v_open_n2 <> 10 then raise exception 'R2 FALHOU: N2 deveria manter 10 abertas, tem %', v_open_n2; end if;
  raise notice 'R2 OK: borda 3/3 nao sobrecarrega; NULL com 10 abertas ignorado; nada movido';
end $$;

-- ===== R3: guarda de papel tambem na sobrecarga ============================
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000b001';
  begin
    perform public.reassign_overloaded_agents(true);
    raise exception 'R3 FALHOU: agente comum executou a sobrecarga';
  exception when others then
    if sqlerrm like '%R3 FALHOU%' then raise; end if;
    if sqlerrm not like '%requer perfil admin ou supervisor%' then
      raise exception 'R3 FALHOU: rejeicao inesperada: %', sqlerrm;
    end if;
  end;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
-- Compat: GoTrue antigo le auth.uid() de request.jwt.claim.sub (singular);
-- o novo ignora essa GUC e usa o JSON acima. Espelhar o sub nos dois.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';
  raise notice 'R3 OK: authenticated comum negado tambem na sobrecarga';
end $$;

-- ===== R1: dry-run == real com vaga limitada ===============================
-- O (max 2) tem 4 abertas (excedente 2); S (max 1) tem 1 vaga. Ensaio e real
-- tem que devolver o MESMO numero (1) e o ensaio nao pode mover nada.
-- Sem o contador de simulacao o ensaio devolve 2 (a vaga "livre" em loop).
do $$
declare
  v_o uuid; v_s uuid;
  v_q uuid := '00000000-0000-0000-0000-00000000d005';
  v_dry integer; v_real integer; v_open_s integer; v_open_o integer;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
  values ('00000000-0000-0000-0000-00000000f007','authenticated','authenticated','o@t.local','x',now(),now()),
         ('00000000-0000-0000-0000-00000000f008','authenticated','authenticated','s@t.local','x',now(),now());
  select id into v_o from public.profiles where user_id='00000000-0000-0000-0000-00000000f007';
  select id into v_s from public.profiles where user_id='00000000-0000-0000-0000-00000000f008';
  update public.profiles set max_chats = 2 where id = v_o;
  update public.profiles set max_chats = 1 where id = v_s;
  insert into public.user_sessions (id, user_id, is_active, started_at, last_activity_at, expires_at)
  values ('00000000-0000-0000-0000-00000000e103','00000000-0000-0000-0000-00000000f007',true,now(),now(),now()+interval '1 day'),
         ('00000000-0000-0000-0000-00000000e104','00000000-0000-0000-0000-00000000f008',true,now(),now(),now()+interval '1 day');
  insert into public.queues (id, name, color) values (v_q, 'Fila R1', '#f59e0b');
  insert into public.queue_members (queue_id, profile_id, is_active) values (v_q, v_o, true), (v_q, v_s, true);
  insert into public.contacts (id, name, phone, conversation_status, assigned_to, queue_id, conversation_status_changed_at)
  values
    ('00000000-0000-0000-0000-00000000b211','O o1','+5511****701','open',v_o,v_q, now()-interval '40 minutes'),
    ('00000000-0000-0000-0000-00000000b212','O o2','+5511****702','open',v_o,v_q, now()-interval '39 minutes'),
    ('00000000-0000-0000-0000-00000000b213','O o3','+5511****703','open',v_o,v_q, now()-interval '38 minutes'),
    ('00000000-0000-0000-0000-00000000b214','O o4','+5511****704','open',v_o,v_q, now()-interval '37 minutes');

  v_dry := public.reassign_overloaded_agents(true);
  select count(*) into v_open_s from public.contacts where assigned_to=v_s and conversation_status='open' and deleted_at is null;
  if v_open_s <> 0 then raise exception 'R1 FALHOU: dry-run moveu contato para S'; end if;

  v_real := public.reassign_overloaded_agents(false);
  if v_dry <> 1 then
    raise exception 'R1 FALHOU: dry-run deveria contar 1 (1 vaga), veio %', v_dry;
  end if;
  if v_real <> 1 then
    raise exception 'R1 FALHOU: real deveria mover 1 (1 vaga), veio %', v_real;
  end if;
  if v_dry <> v_real then
    raise exception 'R1 FALHOU: ensaio (%) <> real (%)', v_dry, v_real;
  end if;
  select count(*) into v_open_s from public.contacts where assigned_to=v_s and conversation_status='open' and deleted_at is null;
  select count(*) into v_open_o from public.contacts where assigned_to=v_o and conversation_status='open' and deleted_at is null;
  if v_open_s <> 1 or v_open_o <> 3 then
    raise exception 'R1 FALHOU: estado final (S=%, O=%)', v_open_s, v_open_o;
  end if;
  raise notice 'R1 OK: ensaio == real (1) com vaga limitada; ensaio nao moveu';
end $$;

-- ===== R4: ausente com contato apagado nao move o apagado ===================
do $$
declare
  v_b uuid; v_c uuid;
  v_q uuid := '00000000-0000-0000-0000-00000000d004';
  v_abs integer; v_ok integer;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
  values ('00000000-0000-0000-0000-00000000f005','authenticated','authenticated','b@t.local','x',now(),now()),
         ('00000000-0000-0000-0000-00000000f006','authenticated','authenticated','c@t.local','x',now(),now());
  select id into v_b from public.profiles where user_id='00000000-0000-0000-0000-00000000f005';
  select id into v_c from public.profiles where user_id='00000000-0000-0000-0000-00000000f006';
  update public.profiles set max_chats = 10 where id in (v_b, v_c);
  insert into public.queues (id, name, color) values (v_q, 'Fila R4', '#8b5cf6');
  insert into public.queue_members (queue_id, profile_id, is_active) values (v_q, v_b, true), (v_q, v_c, true);
  -- So B fica sem sessao: re-cobre todo mundo (T4/T10/R1/R2 criaram gente sem
  -- sessao depois da cobertura do topo do arquivo).
  insert into public.user_sessions (id, user_id, is_active, started_at, last_activity_at, expires_at)
  select gen_random_uuid(), p.user_id, true, now(), now(), now() + interval '1 day'
  from public.profiles p
  where p.user_id <> '00000000-0000-0000-0000-00000000f005'
    and not exists (select 1 from public.user_sessions us where us.user_id = p.user_id and us.is_active = true and us.last_activity_at > now() - interval '30 minutes');
  insert into public.contacts (id, name, phone, conversation_status, assigned_to, queue_id, conversation_status_changed_at, deleted_at)
  values
    ('00000000-0000-0000-0000-00000000e201','B o1','+5511****801','open',v_b,v_q, now()-interval '60 minutes', null),
    ('00000000-0000-0000-0000-00000000e202','B del','+5511****802','open',v_b,v_q, now()-interval '59 minutes', now());

  v_abs := public.reassign_absent_agents(30, false);
  if v_abs <> 1 then
    raise exception 'R4 FALHOU: ausencia deveria mover 1 (so a aberta valida), veio %', v_abs;
  end if;
  select count(*) into v_ok from public.contacts where id='00000000-0000-0000-0000-00000000e201' and assigned_to=v_c;
  if v_ok <> 1 then raise exception 'R4 FALHOU: a aberta valida de B nao foi para C'; end if;
  select count(*) into v_ok from public.contacts where id='00000000-0000-0000-0000-00000000e202' and assigned_to=v_b;
  if v_ok <> 1 then raise exception 'R4 FALHOU: o contato apagado de B foi movido'; end if;
  raise notice 'R4 OK: ausente move a aberta valida; apagada fica';
end $$;

rollback;
-- Nada persiste: fixtures e efeitos voltam ao estado anterior.
