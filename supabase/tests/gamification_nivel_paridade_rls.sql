-- gamification_nivel_paridade_rls.sql
-- Prova do módulo de gamificação do Zapp Web V2 (cartão t_e1ee133f / auditoria
-- de paridade com a V3, item V2-GAM-001). Três alvos:
--
--   A) NÍVEL — o cliente (src/hooks/gamification/levelUtils.ts) e o banco
--      (public.calculate_level) têm de dar o MESMO nível para o mesmo XP.
--      A tabela canônica de pares xp→nível é a linha PARIDADE-NIVEL abaixo; o
--      teste do cliente lê ESTE arquivo e exige a mesma linha (mexer num lado
--      sem o outro fica vermelho).
--   B) RLS — um agente comum NÃO altera public.agent_stats nem insere em
--      public.agent_achievements direto; o admin altera/insere. A negação é
--      provada com SET LOCAL ROLE authenticated + request.jwt.claims (papel
--      real), e SEMPRE com a linha existindo antes e o admin conseguindo
--      depois — para não confundir "proibido" com "tabela vazia/quebrada".
--   C) GATILHOS — mensagem de agente e encerramento incrementam os contadores,
--      e erro de gamificação NUNCA derruba o envio da mensagem.
--
-- Como rodar (banco local da tarefa, como postgres):
--   zapp-db-local psql "$PWD" <conjunto> -v ON_ERROR_STOP=1 \
--     < supabase/tests/gamification_nivel_paridade_rls.sql
-- Tudo dentro de BEGIN…ROLLBACK: nenhuma fixture persiste.
--
-- No CI a suíte roda como service_role (BYPASSRLS) e o runner não permite
-- SET ROLE authenticated — nesse caso as seções de enforcement (T2/T3/T5)
-- imprimem NOTICE … PULADO e não falham; a prova de enforcement lá é do gêmeo
-- scripts/db-audit/dashboard-rls-authorization.test.sh (área do worker sql).

-- PARIDADE-NIVEL: 0:1,49:1,50:2,51:2,199:2,200:3,449:3,450:4,800:5,1250:6,5000:11

begin;

-- ===== fixtures ==============================================================
-- agente (u101) e admin (u202); o trigger handle_new_user cria os profiles.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000f101', 'authenticated', 'authenticated', 'agente.tg1@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-00000000f202', 'authenticated', 'authenticated', 'admin.tg1@test.local', '', now(), now(), now());

create temp table tg1_ids on commit drop as
select (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000f101') as agente,
       (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000f202') as admin;

insert into public.user_roles (user_id, role)
values ('00000000-0000-0000-0000-00000000f101', 'agent'),
       ('00000000-0000-0000-0000-00000000f202', 'admin');

insert into public.contacts (id, name, phone, conversation_status, assigned_to)
values ('00000000-0000-0000-0000-00000000f303', 'Contato TG1', '+551****0001', 'open',
        (select agente from tg1_ids));

-- linha de estatística do agente, existente desde já (para a negação não ser "tabela vazia")
insert into public.agent_stats (profile_id, xp, level)
values ((select agente from tg1_ids), 1000, 5);

-- ===== T1: paridade do nível (banco) =========================================
do $$
declare
  v_errado text;
begin
  select string_agg(format('%s->%s(esperado %s)', p.xp, public.calculate_level(p.xp), p.nivel), ', ')
    into v_errado
    from (values
      (0, 1), (49, 1), (50, 2), (51, 2), (199, 2), (200, 3),
      (449, 3), (450, 4), (800, 5), (1250, 6), (5000, 11)
    ) as p(xp, nivel)
   where public.calculate_level(p.xp) <> p.nivel;
  if v_errado is not null then
    raise exception 'T1 FALHOU: tabela PARIDADE-NIVEL divergiu: %', v_errado;
  end if;

  select string_agg(x::text, ', ') into v_errado
    from generate_series(0, 2000) as g(x)
   where public.calculate_level(g.x) <> greatest(1, floor(sqrt(greatest(0, g.x) / 50.0))::int + 1);
  if v_errado is not null then
    raise exception 'T1 FALHOU: calculate_level fora da fórmula GREATEST(1, FLOOR(SQRT(xp/50.0))+1) em xp=[%]', v_errado;
  end if;

  raise notice 'T1 OK: calculate_level bate com a tabela PARIDADE-NIVEL e com a fórmula em 0..2000';
end $$;

-- ===== T2: agente comum NÃO altera agent_stats direto (papel real) ============
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}';
do $$
declare
  v_pulado boolean := false;
  v_n      integer := 0;
  v_erro   text := null;
  v_xp     bigint;
begin
  begin
    execute 'set local role authenticated';
  exception when others then
    v_pulado := true;
  end;
  if v_pulado then
    raise notice 'T2 PULADO: runner sem SET ROLE authenticated (CI/service_role); enforcement no CI é do gêmeo scripts/db-audit/dashboard-rls-authorization.test.sh';
    return;
  end if;

  -- a linha existe e é visível para o próprio agente (a policy de leitura permite)
  select xp into v_xp from public.agent_stats where profile_id = (select agente from tg1_ids);
  if v_xp is null then
    raise exception 'T2 FALHOU: o agente não vê a própria linha — a negação não provaria nada';
  end if;

  begin
    update public.agent_stats
       set xp = 999999, level = 999
     where profile_id = (select agente from tg1_ids);
    get diagnostics v_n = row_count;
  exception when others then
    v_erro := sqlstate || ' ' || sqlerrm;
  end;

  execute 'reset role';

  if v_n > 0 then
    raise exception 'T2 FALHOU: agente comum alterou agent_stats direto (% linha(s))', v_n;
  end if;
  raise notice 'T2 OK: agente barrado em agent_stats (%); a linha existia e continua lá', coalesce(v_erro, '0 linhas afetadas');
end $$;

-- admin altera a mesma linha (prova que a negação é policy, não tabela quebrada)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000f202","role":"authenticated"}';
do $$
declare
  v_pulado boolean := false;
  v_n      integer := 0;
begin
  begin
    execute 'set local role authenticated';
  exception when others then
    v_pulado := true;
  end;
  if v_pulado then
    raise notice 'T2b PULADO: runner sem SET ROLE authenticated';
    return;
  end if;

  update public.agent_stats
     set xp = xp + 1
   where profile_id = (select agente from tg1_ids);
  get diagnostics v_n = row_count;
  execute 'reset role';

  if v_n <> 1 then
    raise exception 'T2b FALHOU: admin deveria alterar 1 linha de agent_stats, alterou %', v_n;
  end if;
  raise notice 'T2b OK: admin altera agent_stats (a negação do agente vem da policy, não de tabela/permissão quebrada)';
end $$;

do $$
declare
  v_xp bigint;
begin
  select xp into v_xp from public.agent_stats where profile_id = (select agente from tg1_ids);
  if v_xp <> 1001 then
    raise exception 'T2c FALHOU: xp do agente ficou % (esperado 1001 — só o admin somou 1)', v_xp;
  end if;
  raise notice 'T2c OK: depois das duas tentativas, xp = 1001 (o UPDATE do agente não gravou nada)';
end $$;

-- ===== T3: agente comum NÃO insere conquista direto; admin insere =============
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}';
do $$
declare
  v_pulado boolean := false;
  v_n      integer := 0;
  v_erro   text := null;
begin
  begin
    execute 'set local role authenticated';
  exception when others then
    v_pulado := true;
  end;
  if v_pulado then
    raise notice 'T3 PULADO: runner sem SET ROLE authenticated';
    return;
  end if;

  begin
    insert into public.agent_achievements
      (profile_id, achievement_type, achievement_name, achievement_description, xp_earned)
    values
      ((select agente from tg1_ids), 'manual_tg1', 'Conquista forjada TG1', 'inserida direto pelo agente', 500);
    get diagnostics v_n = row_count;
  exception when others then
    v_erro := sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';

  if v_n > 0 then
    raise exception 'T3 FALHOU: agente comum inseriu conquista direto (% linha(s))', v_n;
  end if;
  raise notice 'T3 OK: agente barrado em agent_achievements (%)', coalesce(v_erro, '0 linhas inseridas');
end $$;

do $$
begin
  if exists (
    select 1 from public.agent_achievements
     where profile_id = (select agente from tg1_ids) and achievement_type = 'manual_tg1'
  ) then
    raise exception 'T3b FALHOU: a conquista forjada pelo agente entrou na tabela';
  end if;
  raise notice 'T3b OK: nenhuma linha de conquista forjada no banco';
end $$;

-- admin insere a mesma conquista (prova que o INSERT direto existe e funciona)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000f202","role":"authenticated"}';
do $$
declare
  v_pulado boolean := false;
  v_n      integer := 0;
begin
  begin
    execute 'set local role authenticated';
  exception when others then
    v_pulado := true;
  end;
  if v_pulado then
    raise notice 'T3c PULADO: runner sem SET ROLE authenticated';
    return;
  end if;

  insert into public.agent_achievements
    (profile_id, achievement_type, achievement_name, achievement_description, xp_earned)
  values
    ((select agente from tg1_ids), 'manual_tg1_admin', 'Conquista TG1 (admin)', 'inserida pelo admin', 5);
  get diagnostics v_n = row_count;
  execute 'reset role';

  if v_n <> 1 then
    raise exception 'T3c FALHOU: admin deveria inserir 1 conquista, inseriu %', v_n;
  end if;
  raise notice 'T3c OK: admin insere conquista direto — a negação do agente é a policy, não tabela quebrada';
end $$;

-- ===== T4: mensagem de agente no marco 10 incrementa e NÃO derruba o envio ====
do $$
declare
  v_msg  uuid := gen_random_uuid();
  v_sent bigint;
  v_xp   bigint;
  v_ach  integer;
begin
  update public.agent_stats
     set messages_sent = 9, messages_received = 0, xp = 0, level = 1
   where profile_id = (select agente from tg1_ids);

  insert into public.messages (id, contact_id, sender, content, agent_id)
  values (v_msg, '00000000-0000-0000-0000-00000000f303', 'agent', 'Mensagem TG1 no marco 10',
          (select agente from tg1_ids));

  if not exists (select 1 from public.messages where id = v_msg) then
    raise exception 'T4 FALHOU: o gatilho de gamificação derrubou o envio da mensagem';
  end if;

  select messages_sent, xp into v_sent, v_xp
    from public.agent_stats where profile_id = (select agente from tg1_ids);
  if v_sent <> 10 then
    raise exception 'T4 FALHOU: messages_sent = % (esperado 10)', v_sent;
  end if;

  select count(*) into v_ach
    from public.agent_achievements
   where profile_id = (select agente from tg1_ids) and achievement_type = 'message_milestone';
  if v_ach <> 1 then
    raise exception 'T4 FALHOU: no marco 10 nenhuma conquista message_milestone foi gravada (era o defeito do marco)';
  end if;
  -- LEAST(100, v_total/10) = LEAST(100, 1) = 1
  if v_xp <> 1 then
    raise exception 'T4 FALHOU: xp do marco = % (esperado 1 = LEAST(100, 10/10))', v_xp;
  end if;

  raise notice 'T4 OK: mensagem no marco 10 persiste, messages_sent = 10 e conquista gravada (xp = 1)';
end $$;

-- ===== T5: o envio sob o PAPEL REAL do agente também incrementa ==============
do $$
begin
  update public.agent_stats
     set messages_sent = 0, messages_received = 0, xp = 0
   where profile_id = (select agente from tg1_ids);
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}';
do $$
declare
  v_pulado boolean := false;
  v_msg    uuid := gen_random_uuid();
  v_sent   bigint;
begin
  begin
    execute 'set local role authenticated';
  exception when others then
    v_pulado := true;
  end;
  if v_pulado then
    raise notice 'T5 PULADO: runner sem SET ROLE authenticated';
    return;
  end if;

  insert into public.messages (id, contact_id, sender, content, agent_id)
  values (v_msg, '00000000-0000-0000-0000-00000000f303', 'agent', 'Mensagem TG1 sob authenticated',
          (select agente from tg1_ids));

  execute 'reset role';

  if not exists (select 1 from public.messages where id = v_msg) then
    raise exception 'T5 FALHOU: o envio do agente autenticado foi derrubado';
  end if;

  select messages_sent into v_sent
    from public.agent_stats where profile_id = (select agente from tg1_ids);
  if v_sent <> 1 then
    raise exception 'T5b FALHOU: messages_sent sob papel real = % (esperado 1)', v_sent;
  end if;
  raise notice 'T5 OK: agente autenticado envia e o contador sobe (o gatilho alcança agent_stats por ser SECURITY DEFINER)';
end $$;

-- ===== T6: encerramento incrementa conversations_resolved ====================
do $$
begin
  update public.agent_stats
     set conversations_resolved = 1, xp = 0
   where profile_id = (select agente from tg1_ids);
end $$;

do $$
declare
  v_res bigint;
begin
  insert into public.conversation_closures (id, contact_id, closed_by, close_reason)
  values (gen_random_uuid(), '00000000-0000-0000-0000-00000000f303',
          (select agente from tg1_ids), 'tg1 encerramento');

  select conversations_resolved into v_res
    from public.agent_stats where profile_id = (select agente from tg1_ids);
  if v_res <> 2 then
    raise exception 'T6 FALHOU: conversations_resolved = % (esperado 2)', v_res;
  end if;
  raise notice 'T6 OK: encerramento incrementa conversations_resolved (1 → 2)';
end $$;

-- e no marco 10 grava a conquista 'resolution_milestone' sem derrubar o encerramento
do $$
begin
  update public.agent_stats set conversations_resolved = 9, xp = 0
   where profile_id = (select agente from tg1_ids);
end $$;

do $$
declare
  v_res bigint;
  v_ach integer;
begin
  insert into public.conversation_closures (id, contact_id, closed_by, close_reason)
  values (gen_random_uuid(), '00000000-0000-0000-0000-00000000f303',
          (select agente from tg1_ids), 'tg1 marco 10');

  if not exists (
    select 1 from public.conversation_closures
     where contact_id = '00000000-0000-0000-0000-00000000f303'
       and close_reason = 'tg1 marco 10'
  ) then
    raise exception 'T6b FALHOU: o encerramento no marco 10 foi derrubado pela gamificação';
  end if;

  select conversations_resolved into v_res
    from public.agent_stats where profile_id = (select agente from tg1_ids);
  if v_res <> 10 then
    raise exception 'T6b FALHOU: conversations_resolved = % (esperado 10)', v_res;
  end if;

  select count(*) into v_ach
    from public.agent_achievements
   where profile_id = (select agente from tg1_ids)
     and achievement_type = 'resolution_milestone';
  if v_ach <> 1 then
    raise exception 'T6b FALHOU: marco 10 de encerramento não gravou a conquista resolution_milestone';
  end if;
  raise notice 'T6b OK: marco 10 de encerramento conta 10 e grava a conquista';
end $$;

-- ===== T7: gamificação quebrada NUNCA derruba o envio (injeção de falha) =====
-- Reverte a rotina interna por um stub que SEMPRE levanta erro; o gatilho tem de
-- engolir o erro e a mensagem tem de continuar gravada. (O rollback final desfaz o stub.)
do $$
begin
  update public.agent_stats set messages_sent = 9, messages_received = 0
   where profile_id = (select agente from tg1_ids);
end $$;

create or replace function public.grant_agent_achievement_internal(
  p_profile_id uuid, p_type text, p_name text, p_description text, p_xp_reward integer
) returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  raise exception 'injecao de falha proposital (T7)';
end $$;

do $$
declare
  v_msg uuid := gen_random_uuid();
begin
  insert into public.messages (id, contact_id, sender, content, agent_id)
  values (v_msg, '00000000-0000-0000-0000-00000000f303', 'agent', 'Mensagem TG1 com gamificação quebrada',
          (select agente from tg1_ids));

  if not exists (select 1 from public.messages where id = v_msg) then
    raise exception 'T7 FALHOU: gamificação quebrada DERRUBOU o envio da mensagem';
  end if;
  raise notice 'T7 OK: com a gamificação forçada a falhar, a mensagem continua gravada (envio nunca cai)';
end $$;

rollback;
-- Nada persiste: fixtures, contadores e o stub da rotina interna voltam ao estado anterior.
