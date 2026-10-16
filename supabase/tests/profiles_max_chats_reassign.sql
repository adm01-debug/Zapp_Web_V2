-- profiles_max_chats_reassign.sql
-- Prova de contrato do cartão t_d801d1cf sobre a migration
-- 20261016143509_profiles_max_chats_check.
--
-- Roda no banco local da tarefa:
--   zapp-db-local psql <copia> <conjunto> -f supabase/tests/profiles_max_chats_reassign.sql
-- Tudo dentro de BEGIN…ROLLBACK: nenhuma fixture persiste.
--
-- O que prova:
--   C1  profiles.max_chats ganhou faixa: UPDATE com 0, -3, 51 e 999 falha (23514);
--   C2  a faixa aceita 1, 50 e NULL (NULL = sem limite configurado);
--   C3  a constraint profiles_max_chats_check existe, está coerente com o dado
--       (validada só quando não há linha legada fora da faixa) e o contrato de
--       max_chats NULL está documentado no COMMENT da função;
--   C4  reassign_overloaded_agents() drena o EXCEDENTE e PARA no teto: agente com
--       max_chats=2 e 4 contatos fica com 2 e a RPC devolve 2 realocações;
--   C5  atendente com max_chats NULL (sem teto) NÃO é drenado: os 4 contatos dele
--       continuam com ele depois da chamada (comportamento documentado no COMMENT);
--   C6  com o PAPEL real authenticated sem admin/supervisor a RPC levanta exception
--       e nada muda (a chamada de C4/C5 roda como role authenticated de verdade).

begin;

-- ===== fixtures (como postgres, nenhum JWT ainda) ==============================
-- admin (executor), 3 atendentes na mesma fila e 1 authenticated sem papel.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'admin.t801@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-00000000b002', 'authenticated', 'authenticated', 'cheio.t801@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-00000000c003', 'authenticated', 'authenticated', 'semteto.t801@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-00000000d004', 'authenticated', 'authenticated', 'vago.t801@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-00000000e005', 'authenticated', 'authenticated', 'sempermissao.t801@test.local', '', now(), now(), now());

-- O trigger handle_new_user cria o profile de cada auth.users; guardamos os ids.
create temp table t801_ids on commit drop as
select (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000a001') as admin_profile,
       (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000b002') as cheio_profile,
       (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000c003') as semteto_profile,
       (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000d004') as vago_profile;

insert into public.user_roles (user_id, role)
values ('00000000-0000-0000-0000-00000000a001', 'admin');

-- cheio: max_chats=2 (passou do teto) | semteto: max_chats NULL | vago: max_chats=10
update public.profiles set is_active = true,
       max_chats = case user_id
                     when '00000000-0000-0000-0000-00000000b002' then 2
                     when '00000000-0000-0000-0000-00000000c003' then null
                     when '00000000-0000-0000-0000-00000000d004' then 10
                     else max_chats
                   end
 where user_id in ('00000000-0000-0000-0000-00000000b002',
                   '00000000-0000-0000-0000-00000000c003',
                   '00000000-0000-0000-0000-00000000d004');

insert into public.queues (id, name, color)
values ('00000000-0000-0000-0000-0000000f0001', 'Fila T801', '#22c55e');

insert into public.queue_members (queue_id, profile_id, is_active)
select '00000000-0000-0000-0000-0000000f0001', p, true
  from (values ((select cheio_profile from t801_ids)),
               ((select semteto_profile from t801_ids)),
               ((select vago_profile from t801_ids))) as v(p);

-- 4 contatos com 'cheio' (teto 2 => excedente 2), 4 com 'semteto' (sem teto), 0 com 'vago'.
insert into public.contacts (id, name, phone, conversation_status, assigned_to, queue_id, updated_at)
values
  ('00000000-0000-0000-0000-0000000c0001', 'C1 t801', '+551****0001', 'open', (select cheio_profile from t801_ids), '00000000-0000-0000-0000-0000000f0001', now() - interval '4 hours'),
  ('00000000-0000-0000-0000-0000000c0002', 'C2 t801', '+551****0002', 'open', (select cheio_profile from t801_ids), '00000000-0000-0000-0000-0000000f0001', now() - interval '3 hours'),
  ('00000000-0000-0000-0000-0000000c0003', 'C3 t801', '+551****0003', 'open', (select cheio_profile from t801_ids), '00000000-0000-0000-0000-0000000f0001', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-0000000c0004', 'C4 t801', '+551****0004', 'open', (select cheio_profile from t801_ids), '00000000-0000-0000-0000-0000000f0001', now() - interval '1 hours'),
  ('00000000-0000-0000-0000-0000000c0005', 'C5 t801', '+551****0005', 'open', (select semteto_profile from t801_ids), '00000000-0000-0000-0000-0000000f0001', now() - interval '5 hours'),
  ('00000000-0000-0000-0000-0000000c0006', 'C6 t801', '+551****0006', 'open', (select semteto_profile from t801_ids), '00000000-0000-0000-0000-0000000f0001', now() - interval '6 hours'),
  ('00000000-0000-0000-0000-0000000c0007', 'C7 t801', '+551****0007', 'open', (select semteto_profile from t801_ids), '00000000-0000-0000-0000-0000000f0001', now() - interval '7 hours'),
  ('00000000-0000-0000-0000-0000000c0008', 'C8 t801', '+551****0008', 'open', (select semteto_profile from t801_ids), '00000000-0000-0000-0000-0000000f0001', now() - interval '8 hours');

-- ===== C1: faixa recusa 0, -3, 51 e 999 (SQLSTATE 23514) ======================
do $$
declare
  v_ruim integer;
begin
  foreach v_ruim in array array[0, -3, 51, 999] loop
    begin
      update public.profiles set max_chats = v_ruim
       where user_id = '00000000-0000-0000-0000-00000000a001';
      raise exception 'C1 FALHOU: max_chats=% passou pelo CHECK', v_ruim;
    exception
      when check_violation then null;  -- 23514: esperado
    end;
  end loop;
  raise notice 'C1 OK: CHECK profiles_max_chats_check recusou 0, -3, 51 e 999 (23514)';
end $$;

-- ===== C2: faixa aceita 1, 50 e NULL =========================================
do $$
declare
  v_bom integer;
begin
  foreach v_bom in array array[1, 50] loop
    update public.profiles set max_chats = v_bom
     where user_id = '00000000-0000-0000-0000-00000000a001';
  end loop;
  update public.profiles set max_chats = null
   where user_id = '00000000-0000-0000-0000-00000000a001';
  raise notice 'C2 OK: 1, 50 e NULL aceitos (NULL = sem limite configurado)';
end $$;

-- ===== C3: constraint presente, coerente com o dado, contrato documentado =====
do $$
declare
  v_val boolean;
  v_fora integer;
  v_comentario text;
begin
  select c.convalidated into v_val
    from pg_constraint c
   where c.conname = 'profiles_max_chats_check'
     and c.conrelid = 'public.profiles'::regclass
     and c.contype = 'c';
  if v_val is null then
    raise exception 'C3 FALHOU: constraint profiles_max_chats_check nao existe em public.profiles';
  end if;

  select count(*) into v_fora
    from public.profiles
   where max_chats is not null and (max_chats < 1 or max_chats > 50);

  if v_fora = 0 and not v_val then
    raise exception 'C3 FALHOU: base limpa, mas a constraint ficou NOT VALID';
  end if;
  if v_fora > 0 and v_val then
    raise exception 'C3 FALHOU: % linha(s) fora de 1..50 com a constraint validada', v_fora;
  end if;

  select obj_description('public.reassign_overloaded_agents()'::regprocedure, 'pg_proc')
    into v_comentario;
  if v_comentario is null or v_comentario not like '%max_chats NULL%' then
    raise exception 'C3 FALHOU: COMMENT da funcao nao documenta max_chats NULL';
  end if;

  raise notice 'C3 OK: constraint presente (validada=%, linhas fora da faixa=%) e COMMENT da funcao documentado',
    v_val, v_fora;
end $$;

-- ===== C4/C5: drenagem como role authenticated de verdade =====================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';

set local role authenticated;
do $$
declare
  v_n integer;
begin
  v_n := public.reassign_overloaded_agents();
  if v_n is distinct from 2 then
    raise exception 'C4 FALHOU: esperava 2 realocacoes (2 contatos acima de max_chats=2), veio %', v_n;
  end if;
  raise notice 'C4 OK: RPC devolveu 2 realocacoes como role authenticated';
end $$;
reset role;

do $$
declare
  v_cheio integer;
  v_semteto integer;
  v_vago integer;
  v_evt integer;
  v_evt_errado integer;
begin
  select count(*) into v_cheio from public.contacts
   where assigned_to = (select cheio_profile from t801_ids);
  select count(*) into v_semteto from public.contacts
   where assigned_to = (select semteto_profile from t801_ids);
  select count(*) into v_vago from public.contacts
   where assigned_to = (select vago_profile from t801_ids);

  if v_cheio <> 2 then
    raise exception 'C4 FALHOU: agente estourado terminou com % contatos (teto 2)', v_cheio;
  end if;
  if v_vago <> 2 then
    raise exception 'C4 FALHOU: destino recebeu % contatos (esperava 2)', v_vago;
  end if;

  -- C5: quem tem max_chats NULL nao entra como origem do balanceamento.
  if v_semteto <> 4 then
    raise exception 'C5 FALHOU: agente com max_chats NULL terminou com % contatos (esperava os 4 dele)', v_semteto;
  end if;

  select count(*) into v_evt from public.conversation_events
   where event_type = 'overload_reassign'
     and from_agent_id = (select cheio_profile from t801_ids)
     and to_agent_id = (select vago_profile from t801_ids);
  if v_evt <> 2 then
    raise exception 'C4 FALHOU: esperava 2 eventos overload_reassign, veio %', v_evt;
  end if;

  select count(*) into v_evt_errado from public.conversation_events
   where event_type = 'overload_reassign'
     and (from_agent_id = (select semteto_profile from t801_ids)
          or to_agent_id = (select semteto_profile from t801_ids));
  if v_evt_errado <> 0 then
    raise exception 'C5 FALHOU: agente sem teto apareceu em % evento(s) de balanceamento', v_evt_errado;
  end if;

  raise notice 'C4/C5 OK: excedente drenado e parou no teto (2|2|4) e NULL fora do balanceamento';
end $$;

-- ===== C6: authenticated sem admin/supervisor e barrado, nada muda ============
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e005","role":"authenticated"}';
do $$
declare
  v_antes integer;
  v_depois integer;
  v_bloqueou boolean := false;
begin
  select count(*) into v_antes from public.contacts
   where assigned_to in (select cheio_profile from t801_ids);

  begin
    perform public.reassign_overloaded_agents();
  exception when others then
    v_bloqueou := true;
    if sqlerrm not like '%requer perfil admin ou supervisor%' then
      raise exception 'C6 FALHOU: exception inesperada: %', sqlerrm;
    end if;
  end;

  if not v_bloqueou then
    raise exception 'C6 FALHOU: authenticated sem admin/supervisor executou o balanceamento';
  end if;

  select count(*) into v_depois from public.contacts
   where assigned_to in (select cheio_profile from t801_ids);
  if v_depois <> v_antes then
    raise exception 'C6 FALHOU: a carga mudou (% -> %) mesmo com a RPC barrada', v_antes, v_depois;
  end if;

  raise notice 'C6 OK: guarda de papel barrou authenticated sem admin/supervisor sem tocar na carga';
end $$;

rollback;
-- Nada persiste: fixtures e efeitos voltam ao estado anterior.