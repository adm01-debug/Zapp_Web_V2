-- gamification_streak_dias_seguidos.sql
-- Prova de contrato da migration 20261013044500 (PE-30): "Dias seguidos"
-- (agent_stats.current_streak) conta DIAS consecutivos com atividade do agente
-- (mensagem enviada OU conversa encerrada), nunca a quantidade de mensagens.
--
-- Roda como postgres no banco local da tarefa (a migration aplicada):
--   zapp-db-local psql <copia> <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/gamification_streak_dias_seguidos.sql
-- Tudo dentro de BEGIN...ROLLBACK: nenhuma fixture persiste.
--
-- O que prova:
--   T1  register_agent_active_day: primeiro dia ativo -> streak = 1;
--   T2  dia seguinte -> +1;
--   T3  mesmo dia (2 eventos) -> idempotente (nao infla);
--   T4  pulou um dia ou mais -> reinicia em 1;
--   T5  evento retrocedido (dia < ultimo) -> nao mexe na sequencia;
--   T6  gatilho de mensagem: 2 envios no MESMO dia somam 1 ao streak (antes somavam 2);
--   T7  mensagem de contato (recebida) NAO altera o streak nem last_active_date;
--   T8  encerramento de conversa tambem e dia ativo;
--   T9  update_agent_streak(true) (caminho do navegador) idempotente no mesmo dia;
--   T10 backfill: sequencia real do historico, SEM inflar (3 dias seguidos = 3;
--       com falha no meio conta so o sufixo; ultimo dia anterior a ontem = 0;
--       agente sem historico = 0/NULL); updated_at das linhas NAO e reescrito;
--   T11 ACL: register_agent_active_day nao executavel por authenticated/anon;
--       update_agent_streak tambem fechado para authenticated (20261012233536/R2-SEC;
--       fica so service_role).
--   T12 papel real: INSERT em conversation_closures COMO authenticated (SET ROLE +
--       JWT do agente) grava a linha e move conversations_resolved/streak/
--       last_active_date; chamada DIRETA a register_agent_active_day como
--       authenticated e como anon é negada com 42501.
--   T13 rollback: os 5 statements do bloco -- Rollback: executam e restauram o
--       estado anterior (rotina e coluna removidas, função de encerramento de
--       volta a invoker sem search_path).

begin;

-- ===== fixtures =====
-- 6 usuarios; o gatilho handle_new_user cria o profile e init_agent_stats cria a linha
-- de agent_stats (zerada) de cada um.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000a0001','authenticated','authenticated','streak.a@test.local','',now(),now(),now()),
  ('00000000-0000-0000-0000-0000000b0002','authenticated','authenticated','streak.b@test.local','',now(),now(),now()),
  ('00000000-0000-0000-0000-0000000c0003','authenticated','authenticated','streak.c@test.local','',now(),now(),now()),
  ('00000000-0000-0000-0000-0000000d0004','authenticated','authenticated','streak.d@test.local','',now(),now(),now()),
  ('00000000-0000-0000-0000-0000000e0005','authenticated','authenticated','streak.e@test.local','',now(),now(),now()),
  ('00000000-0000-0000-0000-0000000f0006','authenticated','authenticated','streak.f@test.local','',now(),now(),now());

create temp table t_ids on commit drop as
select (select id from public.profiles where user_id='00000000-0000-0000-0000-0000000a0001') as a,
       (select id from public.profiles where user_id='00000000-0000-0000-0000-0000000b0002') as b,
       (select id from public.profiles where user_id='00000000-0000-0000-0000-0000000c0003') as c,
       (select id from public.profiles where user_id='00000000-0000-0000-0000-0000000d0004') as d,
       (select id from public.profiles where user_id='00000000-0000-0000-0000-0000000e0005') as e,
       (select id from public.profiles where user_id='00000000-0000-0000-0000-0000000f0006') as f;

-- Contato (usado pela mensagem recebida T7 e pelo encerramento T8). assigned_to e
-- definido no INSERT de proposito: o guard trg_prevent_contact_assignee_hijack so
-- dispara no UPDATE (20260929790000), e um UPDATE em contacts fora de sessao com JWT
-- levantaria authentication_required antes mesmo da regra de streak.
create temp table t_contact on commit drop as
select gen_random_uuid() as id;
insert into public.contacts (id, name, phone, assigned_to)
select id, 'Contato Streak', '+5500000000001', (select b from t_ids) from t_contact;

-- ===== T1..T5: nucleo de dias do register_agent_active_day =====================
do $$
declare
  p uuid; r json; base date; hoje date; st int; lad date; bs int;
begin
  hoje := (now() at time zone 'America/Sao_Paulo')::date;
  base := hoje - 10;
  select a into p from t_ids;

  select current_streak, last_active_date into st, lad from public.agent_stats where profile_id = p;
  if st <> 0 or lad is not null then
    raise exception 'T1 FALHOU: agente novo deveria comecar 0/NULL, veio %/%', st, lad;
  end if;

  -- T1: primeiro dia
  r := public.register_agent_active_day(p, base);
  select current_streak, last_active_date, best_streak into st, lad, bs from public.agent_stats where profile_id = p;
  if st <> 1 or lad <> base or bs <> 1 then
    raise exception 'T1 FALHOU: esperado 1/%/1, veio %/%/%', base, st, lad, bs;
  end if;
  if (r->>'registered')::boolean is not true then
    raise exception 'T1 FALHOU: registered deveria ser true, veio %', r;
  end if;

  -- T2: dia seguinte
  r := public.register_agent_active_day(p, base + 1);
  select current_streak, last_active_date, best_streak into st, lad, bs from public.agent_stats where profile_id = p;
  if st <> 2 or lad <> base + 1 then
    raise exception 'T2 FALHOU: esperado 2/%, veio %/%', base + 1, st, lad;
  end if;

  -- T3: mesmo dia de novo -> idempotente
  r := public.register_agent_active_day(p, base + 1);
  select current_streak, last_active_date into st, lad from public.agent_stats where profile_id = p;
  if st <> 2 or lad <> base + 1 then
    raise exception 'T3 FALHOU: mesmo dia nao deveria somar, veio %/%', st, lad;
  end if;
  if (r->>'registered')::boolean is not false then
    raise exception 'T3 FALHOU: registered deveria ser false, veio %', r;
  end if;

  -- T4: pulou o dia base+2, volta em base+3 -> reinicia em 1
  r := public.register_agent_active_day(p, base + 3);
  select current_streak, last_active_date, best_streak into st, lad, bs from public.agent_stats where profile_id = p;
  if st <> 1 or lad <> base + 3 then
    raise exception 'T4 FALHOU: apos pular um dia deveria reiniciar em 1, veio %/%', st, lad;
  end if;
  if bs <> 2 then
    raise exception 'T4 FALHOU: best_streak deveria preservar 2, veio %', bs;
  end if;

  -- T5: evento retrocedido (base+2 < base+3) -> nao mexe
  r := public.register_agent_active_day(p, base + 2);
  select current_streak, last_active_date into st, lad from public.agent_stats where profile_id = p;
  if st <> 1 or lad <> base + 3 then
    raise exception 'T5 FALHOU: dia retrocedido nao deveria mexer, veio %/%', st, lad;
  end if;
end $$;

-- ===== T6/T7: gatilho de mensagem (mesmo dia nao infla; contato nao conta) =======
update public.agent_stats
   set current_streak = 5, best_streak = 5, messages_sent = 7,
       last_active_date = (now() at time zone 'America/Sao_Paulo')::date - 1
 where profile_id = (select b from t_ids);

insert into public.messages (id, sender, content, agent_id, created_at)
select gen_random_uuid(), 'agent', 'msg 1', (select b from t_ids),
       ((now() at time zone 'America/Sao_Paulo')::date + time '12:00') at time zone 'America/Sao_Paulo';
insert into public.messages (id, sender, content, agent_id, created_at)
select gen_random_uuid(), 'agent', 'msg 2', (select b from t_ids),
       ((now() at time zone 'America/Sao_Paulo')::date + time '13:00') at time zone 'America/Sao_Paulo';

do $$
declare st int; lad date; ms int; hoje date;
begin
  hoje := (now() at time zone 'America/Sao_Paulo')::date;
  select current_streak, last_active_date, messages_sent into st, lad, ms
    from public.agent_stats where profile_id = (select b from t_ids);
  if ms <> 9 then
    raise exception 'T6 FALHOU: messages_sent deveria ser 9 (2 envios), veio %', ms;
  end if;
  if st <> 6 or lad <> hoje then
    raise exception 'T6 FALHOU: 2 envios no MESMO dia deveriam somar 1 (5->6, last=%), veio %/%', hoje, st, lad;
  end if;
end $$;

-- T7: mensagem recebida do contato nao altera streak
insert into public.messages (id, sender, content, contact_id, created_at)
select gen_random_uuid(), 'contact', 'resposta', (select id from t_contact),
       ((now() at time zone 'America/Sao_Paulo')::date + time '14:00') at time zone 'America/Sao_Paulo';

do $$
declare st int; lad date; hoje date; mr int;
begin
  hoje := (now() at time zone 'America/Sao_Paulo')::date;
  select current_streak, last_active_date, messages_received into st, lad, mr
    from public.agent_stats where profile_id = (select b from t_ids);
  if mr <> 1 then
    raise exception 'T7 FALHOU: messages_received deveria ser 1, veio %', mr;
  end if;
  if st <> 6 or lad <> hoje then
    raise exception 'T7 FALHOU: mensagem de contato nao deveria mexer no streak, veio %/%', st, lad;
  end if;
end $$;

-- ===== T8: encerramento de conversa e dia ativo ================================
update public.agent_stats
   set current_streak = 2, best_streak = 2,
       last_active_date = (now() at time zone 'America/Sao_Paulo')::date - 1
 where profile_id = (select c from t_ids);

insert into public.conversation_closures (id, contact_id, closed_by, close_reason, created_at)
select gen_random_uuid(), (select id from t_contact), (select c from t_ids), 'teste streak',
       ((now() at time zone 'America/Sao_Paulo')::date + time '15:00') at time zone 'America/Sao_Paulo';

do $$
declare st int; lad date; hoje date; cr int;
begin
  hoje := (now() at time zone 'America/Sao_Paulo')::date;
  select current_streak, last_active_date, conversations_resolved into st, lad, cr
    from public.agent_stats where profile_id = (select c from t_ids);
  if cr <> 1 then
    raise exception 'T8 FALHOU: conversations_resolved deveria ser 1, veio %', cr;
  end if;
  if st <> 3 or lad <> hoje then
    raise exception 'T8 FALHOU: encerramento deveria somar 1 (2->3, last=%), veio %/%', hoje, st, lad;
  end if;
end $$;

-- ===== T9: RPC do navegador (update_agent_streak) idempotente no dia ============
update public.agent_stats
   set current_streak = 4, best_streak = 4,
       last_active_date = (now() at time zone 'America/Sao_Paulo')::date - 1
 where profile_id = (select d from t_ids);

do $$
declare p uuid; r1 json; r2 json; st int; hoje date;
begin
  hoje := (now() at time zone 'America/Sao_Paulo')::date;
  select d into p from t_ids;

  r1 := public.update_agent_streak(p, true);
  if (r1->>'newStreak')::int <> 5 then
    raise exception 'T9 FALHOU: 1a chamada deveria ir de 4 para 5, veio %', r1;
  end if;
  r2 := public.update_agent_streak(p, true);
  select current_streak into st from public.agent_stats where profile_id = p;
  if st <> 5 or (r2->>'newStreak')::int <> 5 then
    raise exception 'T9 FALHOU: 2a chamada no MESMO dia deveria ser no-op, veio %/%', st, r2;
  end if;

  -- reset explicito continua funcionando
  r2 := public.update_agent_streak(p, false);
  select current_streak into st from public.agent_stats where profile_id = p;
  if st <> 0 or (r2->>'newStreak')::int <> 0 then
    raise exception 'T9 FALHOU: reset deveria zerar, veio %/%', st, r2;
  end if;
end $$;

-- ===== T10: backfill ===========================================================
-- e: 3 dias seguidos terminando hoje (streak inflado 999 -> 3)
-- f: sem atividade DE hoje-2 a hoje-1 (gap) -> so o sufixo de hoje = 1
update public.agent_stats set current_streak = 999, best_streak = 999, last_active_date = null
 where profile_id in ((select e from t_ids), (select f from t_ids));

insert into public.messages (id, sender, content, agent_id, created_at)
select gen_random_uuid(), 'agent', 'bf', (select e from t_ids),
       (((now() at time zone 'America/Sao_Paulo')::date - 2) + time '10:00') at time zone 'America/Sao_Paulo'
union all
select gen_random_uuid(), 'agent', 'bf', (select e from t_ids),
       (((now() at time zone 'America/Sao_Paulo')::date - 1) + time '10:00') at time zone 'America/Sao_Paulo'
union all
select gen_random_uuid(), 'agent', 'bf', (select e from t_ids),
       ((now() at time zone 'America/Sao_Paulo')::date + time '10:00') at time zone 'America/Sao_Paulo'
union all
select gen_random_uuid(), 'agent', 'bf', (select f from t_ids),
       (((now() at time zone 'America/Sao_Paulo')::date - 3) + time '10:00') at time zone 'America/Sao_Paulo'
union all
select gen_random_uuid(), 'agent', 'bf', (select f from t_ids),
       ((now() at time zone 'America/Sao_Paulo')::date + time '10:00') at time zone 'America/Sao_Paulo';

-- updated_at que o backfill NAO pode reescrever (guardado antes de rodar o bloco)
create temp table t_tu on commit drop as
select profile_id, updated_at from public.agent_stats
 where profile_id in ((select e from t_ids), (select f from t_ids));

-- Mesmo bloco de backfill da migration (migration 20261013044500, secao 4), inclusive o
-- DISABLE/ENABLE do gatilho update_agent_stats_updated_at, igual ao arquivo versionado.
alter table public.agent_stats disable trigger update_agent_stats_updated_at;
with activity as (
  select m.agent_id as profile_id, (m.created_at at time zone 'America/Sao_Paulo')::date as d
    from public.messages m where m.sender = 'agent' and m.agent_id is not null
  union
  select c.closed_by, (c.created_at at time zone 'America/Sao_Paulo')::date
    from public.conversation_closures c where c.closed_by is not null
),
dias as ( select distinct profile_id, d from activity ),
runs as (
  select profile_id, d, d - (row_number() over (partition by profile_id order by d))::int as grp from dias
),
tamanhos as ( select profile_id, grp, count(*)::int as len, max(d) as fim from runs group by profile_id, grp ),
ultima as ( select distinct on (profile_id) profile_id, len, fim from tamanhos order by profile_id, fim desc ),
melhor as ( select profile_id, max(len)::int as best from tamanhos group by profile_id ),
hoje as ( select (now() at time zone 'America/Sao_Paulo')::date as d ),
novo as (
  select s.profile_id,
         case when u.fim >= (select d from hoje) - 1 then u.len else 0 end as cs,
         greatest(m.best, u.len) as bs,
         u.fim as lad
    from public.agent_stats s join ultima u on u.profile_id = s.profile_id join melhor m on m.profile_id = s.profile_id
)
update public.agent_stats s
   set current_streak = n.cs, best_streak = n.bs, last_active_date = n.lad
  from novo n
 where s.profile_id = n.profile_id
   and (s.current_streak is distinct from n.cs or s.best_streak is distinct from n.bs or s.last_active_date is distinct from n.lad);

update public.agent_stats s
   set current_streak = 0, best_streak = 0, last_active_date = null
 where (s.current_streak <> 0 or s.best_streak <> 0 or s.last_active_date is not null)
   and not exists (select 1 from public.messages m where m.sender='agent' and m.agent_id = s.profile_id)
   and not exists (select 1 from public.conversation_closures c where c.closed_by = s.profile_id);

alter table public.agent_stats enable trigger update_agent_stats_updated_at;

do $$
declare st_e int; bs_e int; lad_e date; st_f int; bs_f int; lad_f date; st_a int; bs_a int; lad_a date; hoje date;
begin
  hoje := (now() at time zone 'America/Sao_Paulo')::date;
  select current_streak, best_streak, last_active_date into st_e, bs_e, lad_e from public.agent_stats where profile_id = (select e from t_ids);
  if st_e <> 3 or bs_e <> 3 or lad_e <> hoje then
    raise exception 'T10a FALHOU: 3 dias seguidos ate hoje deveriam dar 3/3/%, veio %/%/%', hoje, st_e, bs_e, lad_e;
  end if;
  select current_streak, best_streak, last_active_date into st_f, bs_f, lad_f from public.agent_stats where profile_id = (select f from t_ids);
  if st_f <> 1 or bs_f <> 1 or lad_f <> hoje then
    raise exception 'T10b FALHOU: sufixo de hoje (com gap) deveria dar 1/1/%, veio %/%/%', hoje, st_f, bs_f, lad_f;
  end if;
  select current_streak, best_streak, last_active_date into st_a, bs_a, lad_a from public.agent_stats where profile_id = (select a from t_ids);
  if st_a <> 0 or bs_a <> 0 or lad_a is not null then
    raise exception 'T10c FALHOU: agente sem historico deveria zerar, veio %/%/%', st_a, bs_a, lad_a;
  end if;

  -- T10d/e: o backfill nao pode reescrever updated_at (gatilho desligado so no bloco)
  if (select updated_at from public.agent_stats where profile_id = (select e from t_ids))
     is distinct from (select updated_at from t_tu where profile_id = (select e from t_ids)) then
    raise exception 'T10d FALHOU: updated_at de e foi reescrito pelo backfill';
  end if;
  if (select updated_at from public.agent_stats where profile_id = (select f from t_ids))
     is distinct from (select updated_at from t_tu where profile_id = (select f from t_ids)) then
    raise exception 'T10e FALHOU: updated_at de f foi reescrito pelo backfill';
  end if;
end $$;

-- ===== T11: ACL ================================================================
do $$
begin
  if has_function_privilege('authenticated', 'public.register_agent_active_day(uuid,date)', 'execute') then
    raise exception 'T11 FALHOU: authenticated NAO deveria executar register_agent_active_day';
  end if;
  if has_function_privilege('anon', 'public.register_agent_active_day(uuid,date)', 'execute') then
    raise exception 'T11 FALHOU: anon NAO deveria executar register_agent_active_day';
  end if;
  -- Base dia/2026-10-16: 20261012233536 (R2-SEC) fechou o EXECUTE das 4 RPCs de gamificacao
  -- para authenticated (fica so service_role); a expectativa antiga ("authenticated DEVERIA
  -- continuar executando update_agent_streak") valia na base de 13/10 e nao passa mais.
  -- Trava a postura endurecida em vez de reabrir o GRANT:
  if has_function_privilege('authenticated', 'public.update_agent_streak(uuid,boolean)', 'execute') then
    raise exception 'T11 FALHOU: authenticated NAO deveria mais executar update_agent_streak (20261012233536)';
  end if;
  if not has_function_privilege('service_role', 'public.update_agent_streak(uuid,boolean)', 'execute') then
    raise exception 'T11 FALHOU: service_role DEVERIA continuar executando update_agent_streak';
  end if;
end $$;

-- ===== T12: papel real — authenticated fecha conversa ==============================
-- O gatilho trg_gamification_on_closure dispara no INSERT feito pelo papel real
-- (authenticated) em conversation_closures. Como register_agent_active_day é
-- owner-only, o gatilho PRECISA ser SECURITY DEFINER: sem isso, o PERFORM roda
-- com os direitos do chamador, falha com 42501, cai no EXCEPTION e desfaz o
-- INSERT/UPDATE de conversations_resolved do próprio fechamento (além do INSERT
-- em agent_stats, barrado pela RLS para authenticated). Este teste fecha uma
-- conversa COMO authenticated (SET ROLE + JWT do agente) e exige o efeito.
do $$
declare
  v_agent   uuid;
  v_sub     uuid;
  v_contact uuid;
begin
  -- v_agent lido ANTES do SET ROLE: a temp table t_ids não é visível a authenticated.
  select d into v_agent from t_ids;
  -- Parte de estado conhecido: d com streak 2 e último dia ativo ontem.
  update public.agent_stats
     set conversations_resolved = 0, current_streak = 2, best_streak = 2,
         last_active_date = ((now() at time zone 'America/Sao_Paulo')::date - 1)
   where profile_id = (select d from t_ids);

  -- Contato próprio de d (assigned_to = d): passa no WITH CHECK
  -- "Agents can create closures for their contacts".
  insert into public.contacts (name, phone, assigned_to)
  values ('T12 Contato', '+5511999999912', (select d from t_ids))
  returning id into v_contact;

  select user_id into v_sub from public.profiles where id = (select d from t_ids);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_sub::text, 'role', 'authenticated')::text, true);

  set role authenticated;
  insert into public.conversation_closures (contact_id, closed_by, close_reason)
  values (v_contact, v_agent, 'resolvido');
  reset role;
end $$;

-- Leitura e conferência do efeito (como postgres; o efeito foi produzido sob authenticated).
do $$
declare
  v_row public.agent_stats%rowtype;
  v_n   int;
begin
  select count(*) into v_n from public.conversation_closures
   where closed_by = (select d from t_ids) and close_reason = 'resolvido';
  if v_n <> 1 then
    raise exception 'T12 FALHOU: fechamento via authenticated não gravou a linha (%)', v_n;
  end if;
  select * into v_row from public.agent_stats where profile_id = (select d from t_ids);
  if v_row.conversations_resolved <> 1 then
    raise exception 'T12 FALHOU: conversations_resolved via authenticated = % (esperado 1)',
      v_row.conversations_resolved;
  end if;
  if v_row.current_streak <> 3 then
    raise exception 'T12 FALHOU: current_streak via authenticated = % (esperado 3)', v_row.current_streak;
  end if;
  if v_row.last_active_date is distinct from (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'T12 FALHOU: last_active_date via authenticated = % (esperado hoje)', v_row.last_active_date;
  end if;
end $$;

-- ===== T12b: chamada DIRETA à rotina interna é negada (42501) ======================
-- SET ROLE em nível de statement (fora do DO) e UUID literal do agente e
-- ('10000000-0000-0000-0000-000000000005', ver fixtures): a temp table t_ids não é
-- visível a authenticated/anon, e a negação precisa vir do EXECUTE da função
-- (42501 na chamada), não de outra tabela.
set role authenticated;
do $$
begin
  perform public.register_agent_active_day('10000000-0000-0000-0000-000000000005'::uuid, (now() at time zone 'America/Sao_Paulo')::date);
  raise exception 'T12b FALHOU: authenticated executou register_agent_active_day (deveria negar 42501)';
exception when insufficient_privilege then
  -- esperado: sem EXECUTE, erro 42501 na chamada direta
  null;
end $$;
reset role;
set role anon;
do $$
begin
  perform public.register_agent_active_day('10000000-0000-0000-0000-000000000005'::uuid, (now() at time zone 'America/Sao_Paulo')::date);
  raise exception 'T12b FALHOU: anon executou register_agent_active_day (deveria negar 42501)';
exception when insufficient_privilege then
  -- esperado: sem EXECUTE, erro 42501 na chamada direta
  null;
end $$;
reset role;

-- ===== T13: rollback da migration executa e restaura ==============================
-- Mesmos 5 statements do bloco -- Rollback: (linhas 15-19 da migration), copiados
-- para execução: o teste RODA o rollback e confere que o estado anterior volta
-- (rotina removida, coluna removida, função de encerramento de volta a invoker).
drop function if exists public.register_agent_active_day(uuid, date);
alter table public.agent_stats drop column if exists last_active_date;
create or replace function public.handle_message_gamification() returns trigger language plpgsql security definer set search_path to '' as $$ declare v_new_sent int; v_received int; v_total int; begin if tg_op = 'update' and (old.agent_id is not null or new.agent_id is null) then return new; end if; if new.sender = 'agent' and new.agent_id is not null then insert into public.agent_stats (profile_id, messages_sent, messages_received, current_streak, best_streak, updated_at) values (new.agent_id, 1, 0, 1, 1, now()) on conflict (profile_id) do update set messages_sent = public.agent_stats.messages_sent + 1, current_streak = public.agent_stats.current_streak + 1, best_streak = greatest(public.agent_stats.best_streak, public.agent_stats.current_streak + 1), updated_at = now() returning messages_sent, messages_received into v_new_sent, v_received; v_total := v_new_sent + v_received; if v_total = any (array[10, 50, 100, 500, 1000]) then perform public.grant_agent_achievement_internal(new.agent_id, 'message_milestone', v_total || ' Mensagens', 'Você enviou/recebeu ' || v_total || ' mensagens!', least(100, v_total / 10)); end if; end if; return new; exception when others then raise warning 'gamification error in handle_message_gamification (message_id=%): % [%]', new.id, sqlerrm, sqlstate; return new; end; $$;
create or replace function public.handle_conversation_closure_gamification() returns trigger language plpgsql as $$ declare v_resolved bigint; begin if tg_op = 'update' and (old.closed_by is not null or new.closed_by is null) then return new; end if; if new.closed_by is not null then insert into public.agent_stats (profile_id, messages_sent, messages_received, conversations_resolved, current_streak, best_streak, updated_at) values (new.closed_by, 0, 0, 1, 0, 0, now()) on conflict (profile_id) do update set conversations_resolved = public.agent_stats.conversations_resolved + 1, updated_at = now() returning conversations_resolved into v_resolved; if v_resolved = any (array[1, 10, 50, 100, 500]) then perform public.grant_agent_achievement(new.closed_by, 'resolution_milestone', v_resolved || ' Conversas Encerradas', 'Você encerrou ' || v_resolved || ' conversas!', least(100, v_resolved)); end if; end if; return new; exception when others then raise warning 'gamification error in handle_conversation_closure_gamification (closure_id=%): % [%]', new.id, sqlerrm, sqlstate; return new; end; $$;
create or replace function public.update_agent_streak(p_profile_id uuid, p_increment boolean) returns json language plpgsql security definer set search_path to 'public' as $$ declare v_row agent_stats%rowtype; v_new_streak int; v_new_best_streak int; begin if auth.role() = 'anon' or (auth.role() = 'authenticated' and not (p_profile_id in (select id from profiles where user_id = auth.uid()) or is_admin_or_supervisor(auth.uid()))) then raise exception 'permission denied'; end if; select * into v_row from agent_stats where profile_id = p_profile_id for update; if not found then return null; end if; v_new_best_streak := coalesce(v_row.best_streak, 0); if p_increment then v_new_streak := coalesce(v_row.current_streak, 0) + 1; if v_new_streak > v_new_best_streak then v_new_best_streak := v_new_streak; end if; else v_new_streak := 0; end if; update agent_stats set current_streak = v_new_streak, best_streak = v_new_best_streak, updated_at = now() where profile_id = p_profile_id; return json_build_object('newStreak', v_new_streak, 'newBestStreak', v_new_best_streak); end; $$;
do $$
declare
  v_n   int;
  v_def boolean;
  v_cfg text[];
begin
  if to_regprocedure('public.register_agent_active_day(uuid,date)') is not null then
    raise exception 'T13 FALHOU: rollback não removeu register_agent_active_day';
  end if;
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'agent_stats' and column_name = 'last_active_date';
  if v_n <> 0 then
    raise exception 'T13 FALHOU: rollback não removeu agent_stats.last_active_date';
  end if;
  select prosecdef, proconfig into v_def, v_cfg from pg_proc
   where oid = 'public.handle_conversation_closure_gamification()'::regprocedure;
  if v_def then
    raise exception 'T13 FALHOU: rollback não devolveu a função de encerramento a invoker';
  end if;
  if v_cfg is not null then
    raise exception 'T13 FALHOU: rollback não limpou o search_path da função de encerramento';
  end if;
  select prosecdef into v_def from pg_proc
   where oid = 'public.handle_message_gamification()'::regprocedure;
  if not v_def then
    raise exception 'T13 FALHOU: rollback quebrou o DEFINER da função de mensagem';
  end if;
end $$;

rollback;
