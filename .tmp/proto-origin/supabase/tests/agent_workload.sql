-- agent_workload.sql
-- Prova de contrato da RPC public.agent_workload() (migration
-- 20261014133908_agent_workload.sql, cartão t_31f0d04b / 3ª passada admin —
-- carga por atendente agregada no servidor).
--
-- Roda como postgres no banco local da tarefa:
--   zapp-db-local psql . v2-<id> -f supabase/tests/agent_workload.sql
-- Tudo dentro de BEGIN…ROLLBACK: nenhuma fixture persiste no banco local.
--
-- O que prova (com fixtures semeadas de propósito, não com dado pré-existente):
--   T1  os números da RPC são IDÊNTICOS aos das consultas que os hooks fazem hoje
--       (useAgents / useAgentPendingCounts / useAgentRecentSends), para todos os
--       perfis, sem linha duplicada — e batem com os valores concretos esperados
--       (admin 1 aberta/1 aguardando; agente 0/1; terceiro 0/0/nulo);
--   T2  a janela de 30 dias é respeitada: envio de 40 dias atrás NÃO entra no
--       last_send_at (perfil só com envio antigo fica NULL);
--   T3  contato excluído (deleted_at) e contato sem dono não contam;
--   T4  agente comum é NEGADO (chamada como papel authenticated real);
--   T5  sem sessão e sem papel de staff também é negado;
--   T6  service_role (chamada interna de Edge) passa e vê a equipe inteira;
--   T7  ACL: EXECUTE só para authenticated/service_role (negado a anon/PUBLIC),
--       função é SECURITY DEFINER com search_path fixo.

begin;

-- ===== fixtures ==============================================================
-- 3 usuários: admin (com papel), agente comum (sem papel) e terceiro (sem papel).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin.w@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'agente.w@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'terceiro.w@test.local', '', now(), now(), now());

-- O trigger handle_new_user já cria o profile de cada auth.users; guardamos os ids.
create temp table w_ids on commit drop as
select
  (select id from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a1') as admin_profile,
  (select id from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a2') as agent_profile,
  (select id from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a3') as terceiro_profile;

insert into public.user_roles (user_id, role)
values ('00000000-0000-0000-0000-0000000000a1', 'admin');

-- A partir daqui desligamos os gatilhos da DML de fixture (o teste roda como
-- postgres e mede só o efeito lido; nenhum gatilho de contato/mensagem importa).
set local session_replication_role = replica;

-- Contatos: 1 aberto + 1 aguardando do admin; 1 aguardando do agente; ruído que
-- NÃO pode contar (status neutro, excluído, sem dono).
insert into public.contacts (id, name, phone, conversation_status, assigned_to, deleted_at)
values
  ('00000000-0000-0000-0000-0000000000c1', 'Admin aberto',       '+55119000000001', 'open',    (select admin_profile from w_ids), null),
  ('00000000-0000-0000-0000-0000000000c2', 'Admin espera',       '+55119000000002', 'waiting', (select admin_profile from w_ids), null),
  ('00000000-0000-0000-0000-0000000000c3', 'Agente espera',      '+55119000000003', 'waiting', (select agent_profile from w_ids), null),
  ('00000000-0000-0000-0000-0000000000c4', 'Agente neutro',      '+55119000000004', 'pending', (select agent_profile from w_ids), null),
  ('00000000-0000-0000-0000-0000000000c5', 'Agente espera morto','+55119000000005', 'waiting', (select agent_profile from w_ids), now()),
  ('00000000-0000-0000-0000-0000000000c6', 'Sem dono',           '+55119000000006', 'waiting', null, null),
  ('00000000-0000-0000-0000-0000000000c7', 'Admin aberto morto', '+55119000000007', 'open',    (select admin_profile from w_ids), now());

-- Mensagens: admin com 2 envios in-window (mais novo = 1h); agente com 1 in-window
-- (5 dias) + 1 fora da janela (40 dias); terceiro SÓ com envio fora da janela;
-- e uma mensagem de cliente (sender <> 'agent') que não conta.
insert into public.messages (id, contact_id, sender, agent_id, content, created_at)
values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'agent',   (select admin_profile from w_ids),    'oi 1',     now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', 'agent',   (select admin_profile from w_ids),    'oi 2',     now() - interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c3', 'agent',   (select agent_profile from w_ids),    'oi 3',     now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000c3', 'agent',   (select agent_profile from w_ids),    'antigo',   now() - interval '40 days'),
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000c6', 'agent',   (select terceiro_profile from w_ids), 'antigo',   now() - interval '40 days'),
  ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000c1', 'contact', null,                                 'recebida', now() - interval '30 minutes');

set local session_replication_role = default;

-- ===== T1: números idênticos aos dos hooks ===================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$
declare
  v_mismatch int;
  v_dup int;
begin
  -- "esperado" = a MESMA conta que os hooks fazem hoje (mesmos filtros, lidos das
  -- tabelas cruas), por perfil, incluindo os filtros de deleted_at e status.
  with esperado as (
    select p.id as profile_id,
           (select count(*) from public.contacts c
             where c.assigned_to = p.id and c.conversation_status = 'open' and c.deleted_at is null)::int as open_chats,
           (select count(*) from public.contacts c
             where c.assigned_to = p.id and c.conversation_status = 'waiting' and c.deleted_at is null)::int as waiting_chats,
           (select max(m.created_at) from public.messages m
             where m.sender = 'agent' and m.agent_id = p.id
               and m.created_at >= now() - interval '30 days') as last_send_at
      from public.profiles p
  ), real as (
    select * from public.agent_workload()
  )
  select count(*) into v_mismatch
    from esperado e
    full join real r on r.profile_id = e.profile_id
   where e.open_chats is distinct from r.open_chats
      or e.waiting_chats is distinct from r.waiting_chats
      or e.last_send_at is distinct from r.last_send_at;

  if v_mismatch > 0 then
    raise exception 'T1 FALHOU: % perfil(is) divergem entre a RPC e a consulta dos hooks', v_mismatch;
  end if;

  select count(*) - count(distinct profile_id) into v_dup from public.agent_workload();
  if v_dup <> 0 then
    raise exception 'T1 FALHOU: a RPC devolveu % linha(s) duplicada(s) por perfil', v_dup;
  end if;

  perform 1 from public.agent_workload() w
   where w.profile_id = (select admin_profile from w_ids)
     and w.open_chats = 1 and w.waiting_chats = 1
     and w.last_send_at = now() - interval '1 hour';
  if not found then
    raise exception 'T1 FALHOU: admin deveria ser 1 aberta / 1 aguardando / ultimo envio 1h';
  end if;

  perform 1 from public.agent_workload() w
   where w.profile_id = (select agent_profile from w_ids)
     and w.open_chats = 0 and w.waiting_chats = 1
     and w.last_send_at = now() - interval '5 days';
  if not found then
    raise exception 'T1 FALHOU: agente deveria ser 0 abertas / 1 aguardando / ultimo envio 5d';
  end if;

  perform 1 from public.agent_workload() w
   where w.profile_id = (select terceiro_profile from w_ids)
     and w.open_chats = 0 and w.waiting_chats = 0 and w.last_send_at is null;
  if not found then
    raise exception 'T1 FALHOU: terceiro deveria ser 0 / 0 / nulo';
  end if;

  raise notice 'T1 OK: RPC == consultas dos hooks (sem duplicata) e valores concretos batem';
end $$;

-- ===== T2/T3: janela de 30 dias, excluído e sem dono =========================
-- O T1 já cobre estaticamente:
--   * agente: last_send_at = -5 dias (o envio de -40 dias foi ignorado);
--   * terceiro: last_send_at IS NULL (só tem envio de -40 dias) ⇒ janela respeitada;
--   * admin: 1 aberta (o contato 'open' excluído não contou);
--   * agente: 1 aguardando (o 'waiting' excluído e o 'pending' não contaram);
--   * contato sem dono ('c6') não aparece como carga de ninguém.
do $$
begin
  perform 1 from public.agent_workload() w
   where w.profile_id = (select agent_profile from w_ids)
     and w.last_send_at = now() - interval '5 days';
  if not found then
    raise exception 'T2 FALHOU: janela de 30 dias nao respeitada no last_send_at do agente';
  end if;
  perform 1 from public.agent_workload() w
   where w.profile_id = (select terceiro_profile from w_ids) and w.last_send_at is null;
  if not found then
    raise exception 'T2 FALHOU: perfil so com envio antigo deveria ter last_send_at NULL';
  end if;
  raise notice 'T2 OK: janela de 30 dias respeitada (envio de 40 dias ignorado)';
end $$;

-- ===== T4: agente comum é NEGADO (papel authenticated real) ==================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
set local role authenticated;
do $$
begin
  begin
    perform 1 from public.agent_workload();
    raise exception 'T4 FALHOU: agente comum recebeu a carga da equipe';
  exception when insufficient_privilege then
    raise notice 'T4 OK: agente comum negado (insufficient_privilege)';
  end;
end $$;
reset role;

-- ===== T5: sem sessão / sem papel de staff ===================================
set local request.jwt.claims = '{}';
do $$
begin
  begin
    perform 1 from public.agent_workload();
    raise exception 'T5a FALHOU: chamada sem sessao passou';
  exception when insufficient_privilege then
    raise notice 'T5a OK: sem sessao negada';
  end;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
  begin
    perform 1 from public.agent_workload();
    raise exception 'T5b FALHOU: agente sem papel recebeu a carga';
  exception when insufficient_privilege then
    raise notice 'T5b OK: papel nao-staff negado';
  end;
end $$;

-- ===== T6: service_role (Edge) passa e vê a equipe inteira ===================
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare
  v_rows int;
  v_profiles int;
begin
  select count(*) into v_rows from public.agent_workload();
  select count(*) into v_profiles from public.profiles;
  if v_rows <> v_profiles then
    raise exception 'T6 FALHOU: service_role viu % linhas para % perfis', v_rows, v_profiles;
  end if;
  raise notice 'T6 OK: service_role ve a equipe inteira (% perfis)', v_rows;
end $$;

-- ===== T7: ACL, SECURITY DEFINER e search_path fixo ==========================
do $$
begin
  if has_function_privilege('anon', 'public.agent_workload()', 'EXECUTE') then
    raise exception 'T7 FALHOU: anon tem EXECUTE';
  end if;
  if exists (
    select 1 from pg_proc p, aclexplode(p.proacl) g
     where p.oid = 'public.agent_workload()'::regprocedure and g.grantee = 0
  ) then
    raise exception 'T7 FALHOU: PUBLIC tem EXECUTE';
  end if;
  if not has_function_privilege('authenticated', 'public.agent_workload()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.agent_workload()', 'EXECUTE') then
    raise exception 'T7 FALHOU: falta EXECUTE para authenticated/service_role';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.agent_workload()'::regprocedure) then
    raise exception 'T7 FALHOU: a funcao nao e SECURITY DEFINER';
  end if;
  if not exists (
    select 1 from pg_proc p
     where p.oid = 'public.agent_workload()'::regprocedure
       and array_to_string(p.proconfig, ',') like '%search_path=%'
  ) then
    raise exception 'T7 FALHOU: SECURITY DEFINER sem search_path fixo';
  end if;
  raise notice 'T7 OK: EXECUTE so authenticated + service_role, DEFINER com search_path fixo';
end $$;

rollback;
-- Nada persiste: fixtures e efeitos voltam ao estado anterior.
