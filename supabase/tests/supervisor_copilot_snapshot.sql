-- supervisor_copilot_snapshot.sql
-- Prova de contrato da RPC public.supervisor_copilot_snapshot (migration
-- 20261013230013, cartão t_77cf8f93 — snapshot gerencial do Copiloto do
-- supervisor).
--
-- Roda como postgres no banco local da tarefa (tudo dentro de BEGIN…ROLLBACK:
-- nenhuma fixture persiste):
--   zapp-db-local psql <copia> <conjunto> -f supabase/tests/supervisor_copilot_snapshot.sql
--
-- O que prova:
--   T1  admin: snapshot por fila (abertas, sem resposta >1h, SLA em risco,
--       SLA estourado do dia) e por atendente (abertas atribuídas, 1ª resposta
--       do dia) + motivos de encerramento dos últimos 7 dias (exclui o antigo);
--   T2  supervisor: mesmo snapshot permitido;
--   T3  sem sessão: exception (42501), nada devolvido;
--   T4  atendente comum (papel real 'authenticated' + sub do agente): negado;
--   T5  papel real anon: negado (permission denied);
--   T6  papel real service_role: passa (chamadas internas);
--   T7  ACL: EXECUTE concedido a authenticated/service_role e negado a
--       anon/PUBLIC;
--   T8  atendente sem resposta no período devolve 0 (não NULL).

begin;

-- ===== fixtures =============================================================
-- 4 usuários: admin, supervisor, agente (com dados), agente 2 (sem dados).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'admin.scs@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-00000000a002', 'authenticated', 'authenticated', 'sup.scs@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-00000000c003', 'authenticated', 'authenticated', 'agente.scs@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-00000000a006', 'authenticated', 'authenticated', 'agente2.scs@test.local', '', now(), now(), now());

-- O trigger handle_new_user cria o profile de cada auth.users; guardamos os ids.
create temp table scs_ids on commit drop as
select
  (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000a001') as admin_profile,
  (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000a002') as sup_profile,
  (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000c003') as agente_profile,
  (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000a006') as agente2_profile;

update public.profiles
   set is_active = true
 where user_id in ('00000000-0000-0000-0000-00000000a001',
                   '00000000-0000-0000-0000-00000000a002',
                   '00000000-0000-0000-0000-00000000c003',
                   '00000000-0000-0000-0000-00000000a006');

insert into public.user_roles (user_id, role)
values
  ('00000000-0000-0000-0000-00000000a001', 'admin'),
  ('00000000-0000-0000-0000-00000000a002', 'supervisor'),
  ('00000000-0000-0000-0000-00000000c003', 'agent'),
  ('00000000-0000-0000-0000-00000000a006', 'agent')
on conflict (user_id, role) do nothing;

insert into public.queues (id, name, color)
values
  ('00000000-0000-0000-0000-00000000d004', 'Fila Alfa SCS', '#22c55e'),
  ('00000000-0000-0000-0000-00000000d005', 'Fila Beta SCS', '#3b82f6');

-- Contatos: Alfa recebe 2 abertas (1 sem resposta há 90 min, 1 respondida hoje
-- com estouro); Beta recebe 1 aberta (sem resposta há 10 min) e 1 resolvida.
insert into public.contacts (id, name, phone, conversation_status, assigned_to, queue_id)
values
  ('00000000-0000-0000-0000-00000000e101', 'Contato Alfa espera', '+551****0101', 'open',
   (select agente_profile from scs_ids), '00000000-0000-0000-0000-00000000d004'),
  ('00000000-0000-0000-0000-00000000e102', 'Contato Alfa respondido', '+551****0102', 'open',
   (select agente_profile from scs_ids), '00000000-0000-0000-0000-00000000d004'),
  ('00000000-0000-0000-0000-00000000e103', 'Contato Beta espera', '+551****0103', 'open',
   null, '00000000-0000-0000-0000-00000000d005'),
  ('00000000-0000-0000-0000-00000000e104', 'Contato Beta resolvido', '+551****0104', 'resolved',
   (select agente_profile from scs_ids), '00000000-0000-0000-0000-00000000d005');

-- SLA (o motor de 1ª resposta usa o limite de 5 min; aqui as linhas são
-- inseridas direto e o flag é explícito):
--   e101: aberta, sem resposta há 90 min  -> sem resposta >1h + SLA em risco
--   e102: aberta, 1ª resposta hoje, 10 min -> estourado hoje
--   e103: aberta, sem resposta há 10 min   -> SLA em risco (>=5 min), <1h
--   e104: resolvida, 1ª resposta hoje, 5 min -> não estoura
insert into public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000e101', now() - interval '90 minutes', null, false, now(), now()),
  ('00000000-0000-0000-0000-00000000e102', now() - interval '20 minutes', now() - interval '10 minutes', true, now(), now()),
  ('00000000-0000-0000-0000-00000000e103', now() - interval '10 minutes', null, false, now(), now()),
  ('00000000-0000-0000-0000-00000000e104', now() - interval '40 minutes', now() - interval '35 minutes', false, now(), now());

-- Encerramentos: 2 'scs_resolvido' + 1 'scs_cliente_sumiu' dentro dos 7 dias;
-- 1 'scs_antigo' há 30 dias (deve ficar FORA). Nomes exclusivos do teste para
-- não colidir com encerramentos já existentes no retrato da produção.
-- session_replication_role=replica: o gatilho que proíbe fechar o mesmo contato
-- duas vezes sem reabrir barraria fixtures sintéticas — desligado só aqui.
set local session_replication_role = replica;
insert into public.conversation_closures (id, contact_id, close_reason, created_at)
values
  ('00000000-0000-0000-0000-00000000e201', '00000000-0000-0000-0000-00000000e104', 'scs_resolvido', now()),
  ('00000000-0000-0000-0000-00000000e202', '00000000-0000-0000-0000-00000000e104', 'scs_resolvido', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000e203', '00000000-0000-0000-0000-00000000e104', 'scs_cliente_sumiu', now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000e204', '00000000-0000-0000-0000-00000000e104', 'scs_antigo', now() - interval '30 days');
set local session_replication_role = origin;

-- ===== T1: admin — snapshot completo ========================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
do $$
declare
  v       jsonb;
  v_row   jsonb;
  v_agent uuid;
begin
  v := public.supervisor_copilot_snapshot();

  -- Fila Alfa: 2 abertas, 1 sem resposta >1h, SLA em risco 1, estourado hoje 1.
  select value into v_row from jsonb_array_elements(v->'queues')
   where value->>'queueId' = '00000000-0000-0000-0000-00000000d004';
  if v_row is null then raise exception 'T1 FALHOU: fila Alfa ausente no snapshot'; end if;
  if v_row->>'openConversations' <> '2'
     or v_row->>'unansweredOver1h' <> '1'
     or v_row->>'slaAtRisk' <> '1'
     or v_row->>'slaBreachedToday' <> '1' then
    raise exception 'T1 FALHOU: fila Alfa errada: %', v_row;
  end if;

  -- Fila Beta: 1 aberta, 0 sem resposta >1h, SLA em risco 1, estourado 0.
  select value into v_row from jsonb_array_elements(v->'queues')
   where value->>'queueId' = '00000000-0000-0000-0000-00000000d005';
  if v_row->>'openConversations' <> '1'
     or v_row->>'unansweredOver1h' <> '0'
     or v_row->>'slaAtRisk' <> '1'
     or v_row->>'slaBreachedToday' <> '0' then
    raise exception 'T1 FALHOU: fila Beta errada: %', v_row;
  end if;

  -- Atendente com dados: 2 abertas atribuídas, 2 respostas hoje.
  select id into v_agent from public.profiles where user_id = '00000000-0000-0000-0000-00000000c003';
  select value into v_row from jsonb_array_elements(v->'agents')
   where value->>'agentId' = v_agent::text;
  if v_row is null then raise exception 'T1 FALHOU: atendente ausente no snapshot'; end if;
  if v_row->>'openAssigned' <> '2' or v_row->>'responsesToday' <> '2' then
    raise exception 'T1 FALHOU: atendente errado: %', v_row;
  end if;

  -- Motivos de encerramento dos últimos 7 dias (scs_resolvido=2, scs_cliente_sumiu=1).
  if not exists (select 1 from jsonb_array_elements(v->'closureReasons7d')
                  where value->>'reason' = 'scs_resolvido' and value->>'count' = '2') then
    raise exception 'T1 FALHOU: motivo scs_resolvido=2 ausente: %', v->'closureReasons7d';
  end if;
  if not exists (select 1 from jsonb_array_elements(v->'closureReasons7d')
                  where value->>'reason' = 'scs_cliente_sumiu' and value->>'count' = '1') then
    raise exception 'T1 FALHOU: motivo scs_cliente_sumiu=1 ausente: %', v->'closureReasons7d';
  end if;
  if exists (select 1 from jsonb_array_elements(v->'closureReasons7d')
              where value->>'reason' = 'scs_antigo') then
    raise exception 'T1 FALHOU: motivo fora dos 7 dias vazou: %', v->'closureReasons7d';
  end if;

  raise notice 'T1 OK: admin — números por fila, por atendente e motivos de encerramento';
end $$;

-- ===== T2: supervisor — permitido ===========================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
do $$
declare
  v jsonb;
begin
  v := public.supervisor_copilot_snapshot();
  if jsonb_typeof(v->'queues') <> 'array' or jsonb_array_length(v->'queues') < 2 then
    raise exception 'T2 FALHOU: supervisor recebeu snapshot vazio: %', v;
  end if;
  raise notice 'T2 OK: supervisor — snapshot permitido';
end $$;

-- ===== T3: sem sessão — negado ==============================================
set local request.jwt.claims = '{}';
do $$
begin
  begin
    perform public.supervisor_copilot_snapshot();
    raise exception 'T3 FALHOU: chamada sem sessão passou';
  exception when others then
    if sqlerrm like '%T3 FALHOU%' then raise; end if;
    if sqlstate <> '42501' then
      raise exception 'T3 FALHOU: erro inesperado (sqlstate=%): %', sqlstate, sqlerrm;
    end if;
    raise notice 'T3 OK: sem sessão negada (%)', sqlerrm;
  end;
end $$;

-- ===== T4: atendente comum — negado =========================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}';
do $$
begin
  begin
    perform public.supervisor_copilot_snapshot();
    raise exception 'T4 FALHOU: atendente comum passou';
  exception when others then
    if sqlerrm like '%T4 FALHOU%' then raise; end if;
    if sqlstate <> '42501' then
      raise exception 'T4 FALHOU: erro inesperado (sqlstate=%): %', sqlstate, sqlerrm;
    end if;
    raise notice 'T4 OK: atendente comum negado (%)', sqlerrm;
  end;
end $$;

-- ===== T5: papel real anon — negado (permission denied) =====================
set local role anon;
do $$
begin
  begin
    perform public.supervisor_copilot_snapshot();
    raise exception 'T5 FALHOU: anon executou';
  exception when insufficient_privilege then
    raise notice 'T5 OK: anon negado (permission denied)';
  end;
end $$;
reset role;

-- ===== T6: papel real service_role — passa ==================================
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare
  v jsonb;
begin
  v := public.supervisor_copilot_snapshot();
  if jsonb_typeof(v->'queues') <> 'array' then
    raise exception 'T6 FALHOU: service_role não recebeu snapshot';
  end if;
  raise notice 'T6 OK: service_role — snapshot permitido';
end $$;
reset role;

-- ===== T7: ACL ==============================================================
do $$
begin
  if has_function_privilege('anon', 'public.supervisor_copilot_snapshot()', 'EXECUTE')
     or exists (
       select 1
         from pg_proc p, aclexplode(p.proacl) g
        where p.oid = 'public.supervisor_copilot_snapshot()'::regprocedure
          and g.grantee = 0  -- grantee 0 = pseudo-papel PUBLIC
     ) then
    raise exception 'T7 FALHOU: EXECUTE aberto para anon/PUBLIC';
  end if;
  if not has_function_privilege('authenticated', 'public.supervisor_copilot_snapshot()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.supervisor_copilot_snapshot()', 'EXECUTE') then
    raise exception 'T7 FALHOU: EXECUTE faltando para authenticated/service_role';
  end if;
  raise notice 'T7 OK: EXECUTE restrito a authenticated + service_role';
end $$;

-- ===== T8: zero respostas = 0 (não NULL) ====================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
do $$
declare
  v       jsonb;
  v_row   jsonb;
  v_agent uuid;
begin
  v := public.supervisor_copilot_snapshot();
  select id into v_agent from public.profiles where user_id = '00000000-0000-0000-0000-00000000a006';
  select value into v_row from jsonb_array_elements(v->'agents')
   where value->>'agentId' = v_agent::text;
  if v_row is null then raise exception 'T8 FALHOU: atendente sem dados ausente'; end if;
  if jsonb_typeof(v_row->'responsesToday') <> 'number' or v_row->>'responsesToday' <> '0'
     or jsonb_typeof(v_row->'openAssigned') <> 'number' or v_row->>'openAssigned' <> '0' then
    raise exception 'T8 FALHOU: zero deveria ser 0 (numero), veio: %', v_row;
  end if;
  raise notice 'T8 OK: atendente sem resposta no período devolve 0 (não NULL)';
end $$;

rollback;
-- Nada persiste: fixtures e efeitos voltam ao estado anterior.
