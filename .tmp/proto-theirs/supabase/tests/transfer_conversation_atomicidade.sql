-- transfer_conversation_atomicidade.sql
-- Prova de contrato da RPC public.transfer_conversation (migration
-- 20261005185729, cartão t_ff895f31 / R2-INB-009 item 88, refazer 2; e
-- migration 20261015182236, cartão t_893a2849 / PK-03).
--
-- Roda como postgres no banco local da tarefa:
--   zapp-db-local psql <copia> <conjunto> -f supabase/tests/transfer_conversation_atomicidade.sql
-- (ou colar no psql). Tudo dentro de BEGIN…ROLLBACK: nenhuma fixture persiste.
--
-- O que prova:
--   T1  caminho feliz agente (admin autenticado): assigned_to muda e o evento
--       nasce com event_type='transfer', to_agent_id, metadata.note e
--       performed_by = perfil do executor;
--   T2  caminho feliz fila (PK-03): queue_id muda e o DONO ANTIGO É LIBERADO
--       (assigned_to NULL) — antes da correção o contato ia para a fila ainda
--       preso ao atendente anterior;
--   T3  ATOMICIDADE (ponto da recusa da rodada 1): forçando o INSERT do evento
--       a falhar (trigger), a RPC aborta e o contato permanece NO ESTADO
--       ORIGINAL — nenhuma transferência persiste sem o evento;
--   T4  sem sessão (sem JWT): exception, nada escrito;
--   T5  autenticado SEM permissão (sem papel/fila/visibilidade): exception,
--       contato intacto;
--   T6  argumentos inválidos (zero ou dois destinos): exception 22023;
--   T7  ACL: EXECUTE concedido a authenticated/service_role, negado a
--       anon/PUBLIC, e uma única assinatura (a antiga de 4 args não existe);
--   T8  compare-and-set do dono (PK-03): dono esperado errado ⇒ 40001 sem tocar
--       contato nem evento; dono esperado certo ⇒ passa; sem
--       p_expected_agent_id ⇒ compatibilidade mantida;
--   T9  papel REAL authenticated: a RPC transfere e libera o dono;
--   T10 papel REAL service_role, sem auth.uid(): roteia (mesmo critério dos
--       gatilhos de hijack).

begin;

-- ===== fixtures ==============================================================
-- 3 usuários: admin (executor), colega (alvo agente), fora (sem permissão).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'admin.t88@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-00000000b002', 'authenticated', 'authenticated', 'colega.t88@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-00000000c003', 'authenticated', 'authenticated', 'fora.t88@test.local', '', now(), now(), now());

-- O trigger handle_new_user já cria o profile de cada auth.users (id gerado):
-- guardamos os ids em uma tabela temporária para referência nos testes.
create temp table t88_ids on commit drop as
select (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000a001') as admin_profile,
       (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000b002') as colega_profile;

-- T9/T10 rodam com o papel REAL (authenticated / service_role): eles precisam
-- ler os ids dos alvos, então o SELECT é liberado só nesta tabela temporária.
grant select on t88_ids to authenticated, service_role;

insert into public.user_roles (user_id, role)
values ('00000000-0000-0000-0000-00000000a001', 'admin');

insert into public.queues (id, name, color)
values ('00000000-0000-0000-0000-00000000d004', 'Fila T88', '#22c55e');

insert into public.contacts (id, name, phone, conversation_status, assigned_to, queue_id)
values ('00000000-0000-0000-0000-00000000e005', 'Contato T88', '+5511900000088', 'open',
        (select admin_profile from t88_ids), '00000000-0000-0000-0000-00000000d004');

-- ===== T1: feliz — transferir para agente (executor = admin autenticado) =====
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';

do $$
declare
  v_event uuid;
  v_assigned uuid;
  v_queue uuid;
  v_evt record;
begin
  v_event := public.transfer_conversation(
    '00000000-0000-0000-0000-00000000e005',
    (select colega_profile from t88_ids),
    null,
    'Cliente pediu urgência'
  );

  select c.assigned_to, c.queue_id into v_assigned, v_queue
    from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e005';
  if v_assigned is distinct from (select colega_profile from t88_ids)
     or v_queue is distinct from '00000000-0000-0000-0000-00000000d004' then
    raise exception 'T1 FALHOU: contato nao refletiu a transferencia para agente';
  end if;

  select * into v_evt from public.conversation_events where id = v_event;
  if v_evt.contact_id <> '00000000-0000-0000-0000-00000000e005'
     or v_evt.event_type <> 'transfer'
     or v_evt.to_agent_id is distinct from (select colega_profile from t88_ids)
     or v_evt.to_queue_id is not null
     or v_evt.from_agent_id is distinct from (select admin_profile from t88_ids)
     or v_evt.from_queue_id is distinct from '00000000-0000-0000-0000-00000000d004'
     or v_evt.performed_by is distinct from (select admin_profile from t88_ids)
     or v_evt.metadata ->> 'note' is distinct from 'Cliente pediu urgência' then
    raise exception 'T1 FALHOU: evento de transferencia incorreto: %', v_evt;
  end if;
  raise notice 'T1 OK: agente — contato transferido e evento com nota gravados juntos';
end $$;

-- ===== T2: fila LIBERA o dono (PK-03, cartão t_893a2849) ====================
-- Antes da correção este é o teste que falhava: com destino fila, o UPDATE
-- mantinha `assigned_to` no atendente anterior (coalesce) e a conversa ia para a
-- fila ainda presa a ele. Agora assigned_to fica NULL e o gatilho de fila
-- (on_contact_queue_auto_assign) NÃO repõe ninguém — ele é BEFORE INSERT.
do $$
declare
  v_event uuid;
  v_queue uuid;
  v_assigned uuid;
  v_evt record;
begin
  v_event := public.transfer_conversation(
    '00000000-0000-0000-0000-00000000e005', null,
    '00000000-0000-0000-0000-00000000d004', 'Fila com contexto');

  select c.queue_id, c.assigned_to into v_queue, v_assigned
    from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e005';
  if v_queue is distinct from '00000000-0000-0000-0000-00000000d004' then
    raise exception 'T2 FALHOU: queue_id nao atualizado';
  end if;
  if v_assigned is not null then
    raise exception 'T2 FALHOU: contato foi para a fila AINDA atribuido (assigned_to=%)', v_assigned;
  end if;

  select * into v_evt from public.conversation_events where id = v_event;
  if v_evt.to_queue_id is distinct from '00000000-0000-0000-0000-00000000d004'
     or v_evt.to_agent_id is not null
     or v_evt.from_agent_id is distinct from (select colega_profile from t88_ids)
     or v_evt.metadata ->> 'note' is distinct from 'Fila com contexto' then
    raise exception 'T2 FALHOU: evento de fila incorreto: %', v_evt;
  end if;
  raise notice 'T2 OK: fila — queue_id gravado, dono antigo liberado (assigned_to NULL), gatilho de fila nao repoe';
end $$;

-- ===== T3: ATOMICIDADE — evento falha ⇒ contato permanece intacto ============
-- Restaura o estado original do contato, instala um trigger que sempre falha o
-- INSERT do evento e chama a RPC: a exceção desfaz o UPDATE junto.
update public.contacts
   set assigned_to = (select admin_profile from t88_ids),
       queue_id    = '00000000-0000-0000-0000-00000000d004'
 where id = '00000000-0000-0000-0000-00000000e005';
delete from public.conversation_events
 where contact_id = '00000000-0000-0000-0000-00000000e005';

create or replace function pg_temp.t88_fail_event_insert()
returns trigger language plpgsql as $f$
begin
  raise exception 'falha forcada no insert do evento (teste T3)';
end;
$f$;

create trigger trg_t88_fail_event
  before insert on public.conversation_events
  for each row execute function pg_temp.t88_fail_event_insert();

do $$
declare
  v_err text;
  v_assigned uuid;
  v_queue uuid;
  v_events integer;
begin
  begin
    perform public.transfer_conversation(
      '00000000-0000-0000-0000-00000000e005',
      (select colega_profile from t88_ids), null, 'nao deve persistir');
    raise exception 'T3 FALHOU: a RPC nao deveria ter sucesso com o evento quebrado';
  exception when others then
    v_err := sqlerrm;
    if v_err like '%nao deveria ter sucesso%' then
      raise;
    end if;
    raise notice 'T3: RPC falhou como esperado: %', v_err;
  end;

  select c.assigned_to, c.queue_id into v_assigned, v_queue
    from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e005';
  if v_assigned is distinct from (select admin_profile from t88_ids)
     or v_queue is distinct from '00000000-0000-0000-0000-00000000d004' then
    raise exception 'T3 FALHOU: ATOMICIDADE VIOLADA — contato mudou mesmo com o evento falho (assigned_to=%, queue_id=%)', v_assigned, v_queue;
  end if;

  select count(*) into v_events from public.conversation_events
   where contact_id = '00000000-0000-0000-0000-00000000e005';
  if v_events <> 0 then
    raise exception 'T3 FALHOU: evento persistiu apesar da falha';
  end if;
  raise notice 'T3 OK: rollback real — evento falhou e o contato ficou intacto';
end $$;

drop trigger trg_t88_fail_event on public.conversation_events;

-- ===== T4: sem sessão ========================================================
set local request.jwt.claims = '{}';
do $$
begin
  begin
    perform public.transfer_conversation(
      '00000000-0000-0000-0000-00000000e005',
      (select colega_profile from t88_ids), null, null);
    raise exception 'T4 FALHOU: chamada anonima passou';
  exception when others then
    if sqlerrm like '%anonima passou%' then raise; end if;
    raise notice 'T4 OK: sem sessao rejeitada (%)', sqlerrm;
  end;
end $$;

-- ===== T5: autenticado sem permissão =========================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}';
do $$
declare
  v_assigned uuid;
begin
  begin
    perform public.transfer_conversation(
      '00000000-0000-0000-0000-00000000e005',
      (select colega_profile from t88_ids), null, null);
    raise exception 'T5 FALHOU: usuario sem permissao transferiu';
  exception when others then
    if sqlerrm like '%sem permissao transferiu%' then raise; end if;
    raise notice 'T5: rejeitado como esperado: %', sqlerrm;
  end;

  select c.assigned_to into v_assigned
    from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e005';
  if v_assigned is distinct from (select admin_profile from t88_ids) then
    raise exception 'T5 FALHOU: contato mudou sem permissao';
  end if;
  raise notice 'T5 OK: sem permissao — exception e contato intacto';
end $$;

-- ===== T6: argumentos inválidos ==============================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
do $$
begin
  begin
    perform public.transfer_conversation('00000000-0000-0000-0000-00000000e005', null, null, null);
    raise exception 'T6a FALHOU: sem destino passou';
  exception when others then
    if sqlerrm like '%sem destino passou%' then raise; end if;
  end;
  begin
    perform public.transfer_conversation(
      '00000000-0000-0000-0000-00000000e005',
      (select colega_profile from t88_ids),
      '00000000-0000-0000-0000-00000000d004', null);
    raise exception 'T6b FALHOU: dois destinos passou';
  exception when others then
    if sqlerrm like '%dois destinos passou%' then raise; end if;
  end;
  raise notice 'T6 OK: exatamente um destino exigido (22023)';
end $$;

-- ===== T7: ACL ===============================================================
do $$
begin
  if has_function_privilege('anon', 'public.transfer_conversation(uuid,uuid,uuid,text,uuid)', 'EXECUTE')
     or exists (
       select 1
         from pg_proc p, aclexplode(p.proacl) g
        where p.oid = 'public.transfer_conversation(uuid,uuid,uuid,text,uuid)'::regprocedure
          and g.grantee = 0  -- grantee 0 = pseudo-papel PUBLIC
     ) then
    raise exception 'T7 FALHOU: EXECUTE aberto para anon/PUBLIC';
  end if;
  if not has_function_privilege('authenticated', 'public.transfer_conversation(uuid,uuid,uuid,text,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.transfer_conversation(uuid,uuid,uuid,text,uuid)', 'EXECUTE') then
    raise exception 'T7 FALHOU: EXECUTE faltando para authenticated/service_role';
  end if;
  -- A assinatura antiga (4 args) não pode mais existir: com as duas, as chamadas
  -- de 4 argumentos ficariam ambíguas (overload + default).
  if to_regprocedure('public.transfer_conversation(uuid,uuid,uuid,text)') is not null then
    raise exception 'T7 FALHOU: a assinatura antiga (4 args) continua existindo';
  end if;
  raise notice 'T7 OK: EXECUTE restrito a authenticated + service_role; uma unica assinatura (5 args)';
end $$;

-- ===== T8: compare-and-set do dono (PK-03, cartão t_893a2849) ================
-- T8a: o chamador manda um dono esperado que não é o dono atual ⇒ 40001, sem
--      escrever nada (contato intacto e nenhum evento novo).
-- T8b: dono esperado igual ao atual ⇒ passa.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
do $$
declare
  v_events_antes integer;
  v_events_depois integer;
  v_assigned uuid;
begin
  select count(*) into v_events_antes
    from public.conversation_events where contact_id = '00000000-0000-0000-0000-00000000e005';

  begin
    -- dono atual é o ADMIN; mandamos o COLEGA como esperado (tela velha).
    perform public.transfer_conversation(
      '00000000-0000-0000-0000-00000000e005',
      (select colega_profile from t88_ids), null, null,
      (select colega_profile from t88_ids));
    raise exception 'T8a FALHOU: o CAS nao barrou o dono esperado errado';
  exception when others then
    if sqlerrm like '%nao barrou%' then raise; end if;
    if sqlstate <> '40001' then
      raise exception 'T8a FALHOU: sqlstate % (esperado 40001): %', sqlstate, sqlerrm;
    end if;
    raise notice 'T8a: CAS barrou como esperado (40001): %', sqlerrm;
  end;

  select c.assigned_to into v_assigned
    from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e005';
  if v_assigned is distinct from (select admin_profile from t88_ids) then
    raise exception 'T8a FALHOU: contato mudou mesmo com o CAS barrando (assigned_to=%)', v_assigned;
  end if;

  select count(*) into v_events_depois
    from public.conversation_events where contact_id = '00000000-0000-0000-0000-00000000e005';
  if v_events_depois <> v_events_antes then
    raise exception 'T8a FALHOU: evento gravado apesar do CAS barrado (% -> %)', v_events_antes, v_events_depois;
  end if;
  raise notice 'T8a OK: CAS barra dono esperado errado (40001) sem tocar contato nem evento';

  -- T8b: agora com o dono esperado correto.
  perform public.transfer_conversation(
    '00000000-0000-0000-0000-00000000e005',
    (select colega_profile from t88_ids), null, null,
    (select admin_profile from t88_ids));
  select c.assigned_to into v_assigned
    from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e005';
  if v_assigned is distinct from (select colega_profile from t88_ids) then
    raise exception 'T8b FALHOU: CAS com dono correto nao transferiu (assigned_to=%)', v_assigned;
  end if;
  raise notice 'T8b OK: CAS com dono esperado correto passa';

  -- T8c: p_expected_agent_id nulo (default) não faz CAS — contrato antigo.
  perform public.transfer_conversation(
    '00000000-0000-0000-0000-00000000e005',
    (select admin_profile from t88_ids), null, null, null);
  raise notice 'T8c OK: sem p_expected_agent_id continua transferindo (compatibilidade)';
end $$;

-- ===== T9: papel real authenticated (ACL de verdade) ========================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
do $$
begin
  perform public.transfer_conversation(
    '00000000-0000-0000-0000-00000000e005', null,
    '00000000-0000-0000-0000-00000000d004', 'papel authenticated',
    (select admin_profile from t88_ids));
end $$;
reset role;
do $$
declare
  v_assigned uuid;
  v_queue uuid;
begin
  select c.assigned_to, c.queue_id into v_assigned, v_queue
    from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e005';
  if v_assigned is not null or v_queue is distinct from '00000000-0000-0000-0000-00000000d004' then
    raise exception 'T9 FALHOU: papel authenticated nao aplicou a transferencia (assigned_to=%, queue_id=%)', v_assigned, v_queue;
  end if;
  raise notice 'T9 OK: com o papel authenticated (sem ser postgres) a RPC transfere e libera o dono';
end $$;

-- ===== T10: papel real service_role, sem auth.uid() =========================
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
begin
  perform public.transfer_conversation(
    '00000000-0000-0000-0000-00000000e005',
    (select colega_profile from t88_ids), null, 'service_role roteando');
end $$;
reset role;
do $$
declare
  v_assigned uuid;
begin
  select c.assigned_to into v_assigned
    from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e005';
  if v_assigned is distinct from (select colega_profile from t88_ids) then
    raise exception 'T10 FALHOU: service_role sem auth.uid() nao conseguiu rotear (assigned_to=%)', v_assigned;
  end if;
  raise notice 'T10 OK: service_role sem auth.uid() roteia (mesmo criterio dos gatilhos de hijack)';
end $$;

rollback;
-- Nada persiste: fixtures e efeitos voltam ao estado anterior.
