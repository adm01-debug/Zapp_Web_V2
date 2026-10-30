-- security_alerts_self_select.sql
-- Prova de contrato da policy public.security_alerts_self_select (migration
-- 20261015172527_security_alerts_self_select.sql, cartão t_bc9431fc / item 33,
-- workersql).
--
-- DEFEITO (vermelho antes do conserto): public.security_alerts não tinha policy
-- de leitura para o DONO do alerta. O agente comum tem GRANT de SELECT na tabela
-- (o PostgREST concede a authenticated), mas a única policy de leitura viva era
-- 'Admins can manage security alerts' (FOR ALL, is_admin_or_supervisor) — então a
-- consulta do agente voltava VAZIA, sem erro, e a tela de segurança mostrava
-- sempre "sem atividades suspeitas".
--
-- Roda como postgres no banco local da tarefa (schema em dia):
--   zapp-db-local psql <copia> <conjunto> < supabase/tests/security_alerts_self_select.sql
-- Tudo dentro de BEGIN…ROLLBACK: nenhuma fixture persiste.
--
-- ENFORCEMENT com PAPEL REAL: as asserções rodam com `set local role authenticated`
-- (e `anon`) + JWT sintético em request.jwt.claims — o caminho do PostgREST, nunca
-- como postgres (dono da tabela, que ignora RLS). Cada bloco confere que o papel
-- pegou (current_user) e FALHA se não pegou, em vez de dar verde por engano.
--
-- O que prova:
--   T1  agente A vê SÓ os 2 alertas dele (nem os do agente B, nem os de sistema);
--   T2  agente B vê só o alerta dele;
--   T3  admin vê os 4 (inclusive o alerta de sistema, user_id NULL);
--   T4  anon não vê nenhum (tem GRANT, não tem policy);
--   T5  agente A não consegue INSERT, nem UPDATE, nem DELETE (nem no próprio alerta
--       — resolver alerta continua sendo de admin);
--   T6  admin resolve um alerta (is_resolved/resolved_at) e continua inserindo;
--   T7  estrutura: 3 policies, RLS ligado, nenhuma policy para anon e a policy nova
--       é SELECT/authenticated com user_id = auth.uid() (lida de pg_policies);
--   T8  ROLLBACK DE VERDADE: o `drop policy` do cabeçalho da migration desfaz o
--       conserto — depois dele o agente A volta a ver zero.

begin;

-- ===== fixtures ==============================================================
-- 3 usuários: A e B (agentes comuns) e ADM (admin). O trigger handle_new_user
-- cria o profile de cada um.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-11111111a001', 'authenticated', 'authenticated', 'agente.a.t33@test.local', '', now(), now(), now()),
  ('11111111-1111-1111-1111-11111111b002', 'authenticated', 'authenticated', 'agente.b.t33@test.local', '', now(), now(), now()),
  ('11111111-1111-1111-1111-11111111c003', 'authenticated', 'authenticated', 'admin.t33@test.local',     '', now(), now(), now());

insert into public.user_roles (user_id, role)
values ('11111111-1111-1111-1111-11111111c003', 'admin');

-- Alertas: 2 do agente A, 1 do agente B e 1 de sistema (user_id NULL). A inserção
-- roda como postgres (dono da tabela): RLS não barra fixture.
insert into public.security_alerts (id, alert_type, severity, title, user_id, created_at)
values
  ('11111111-1111-1111-1111-0000000000a1', 'new_device',        'medium', 'Alerta A1 (do agente A)', '11111111-1111-1111-1111-11111111a001', now() - interval '3 hours'),
  ('11111111-1111-1111-1111-0000000000a2', 'rate_limit',        'low',    'Alerta A2 (do agente A)', '11111111-1111-1111-1111-11111111a001', now() - interval '2 hours'),
  ('11111111-1111-1111-1111-0000000000b1', 'new_device',        'medium', 'Alerta B1 (do agente B)', '11111111-1111-1111-1111-11111111b002', now() - interval '1 hour'),
  ('11111111-1111-1111-1111-0000000000c1', 'suspicious_login',  'high',   'Alerta de sistema',       null,                                  now());

-- ===== T1: agente A vê SÓ os alertas dele ====================================
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-11111111a001","role":"authenticated"}';
set local role authenticated;
do $$
declare
  v_n      int;
  v_n_b    int;
  v_n_sist int;
begin
  if current_user <> 'authenticated' then
    raise exception 'T1 FALHOU: papel efetivo % (esperava authenticated)', current_user;
  end if;

  select count(*) into v_n from public.security_alerts;
  if v_n <> 2 then
    raise exception 'T1 FALHOU: agente A viu % alertas (esperava os 2 dele)', v_n;
  end if;

  select count(*) into v_n_b from public.security_alerts where user_id = '11111111-1111-1111-1111-11111111b002';
  if v_n_b <> 0 then
    raise exception 'T1 FALHOU: agente A viu % alerta(s) do agente B', v_n_b;
  end if;

  select count(*) into v_n_sist from public.security_alerts where user_id is null;
  if v_n_sist <> 0 then
    raise exception 'T1 FALHOU: agente A viu % alerta(s) de sistema (user_id NULL)', v_n_sist;
  end if;

  select count(*) into v_n from public.security_alerts
   where id in ('11111111-1111-1111-1111-0000000000a1', '11111111-1111-1111-1111-0000000000a2');
  if v_n <> 2 then
    raise exception 'T1 FALHOU: agente A nao encontrou os proprios alertas por id (% de 2)', v_n;
  end if;
end $$;
reset role;

-- ===== T2: agente B vê só o dele =============================================
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-11111111b002","role":"authenticated"}';
set local role authenticated;
do $$
declare
  v_n   int;
  v_ids text;
begin
  if current_user <> 'authenticated' then
    raise exception 'T2 FALHOU: papel efetivo %', current_user;
  end if;

  select count(*), coalesce(string_agg(id::text, ',' order by id), '(vazio)')
    into v_n, v_ids
    from public.security_alerts;
  if v_n <> 1 then
    raise exception 'T2 FALHOU: agente B viu % alertas (esperava 1) — ids: %', v_n, v_ids;
  end if;
  if v_ids <> '11111111-1111-1111-1111-0000000000b1' then
    raise exception 'T2 FALHOU: agente B viu outro alerta: %', v_ids;
  end if;
end $$;
reset role;

-- ===== T3: admin vê tudo, inclusive o alerta de sistema ======================
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-11111111c003","role":"authenticated"}';
set local role authenticated;
do $$
declare
  v_n int;
begin
  if current_user <> 'authenticated' then
    raise exception 'T3 FALHOU: papel efetivo %', current_user;
  end if;

  select count(*) into v_n from public.security_alerts;
  if v_n <> 4 then
    raise exception 'T3 FALHOU: admin viu % alertas (esperava os 4)', v_n;
  end if;

  select count(*) into v_n from public.security_alerts where user_id is null;
  if v_n <> 1 then
    raise exception 'T3 FALHOU: admin nao viu o alerta de sistema (user_id NULL)';
  end if;
end $$;
reset role;

-- ===== T4: anon não vê nada (GRANT existe, policy não) =======================
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
do $$
declare
  v_n int;
begin
  if current_user <> 'anon' then
    raise exception 'T4 FALHOU: papel efetivo %', current_user;
  end if;

  select count(*) into v_n from public.security_alerts;
  if v_n <> 0 then
    raise exception 'T4 FALHOU: anon viu % alertas', v_n;
  end if;
end $$;
reset role;

-- ===== T5: agente A não escreve (nem no próprio alerta) ======================
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-11111111a001","role":"authenticated"}';
set local role authenticated;
do $$
declare
  v_n int;
begin
  if current_user <> 'authenticated' then
    raise exception 'T5 FALHOU: papel efetivo %', current_user;
  end if;

  begin
    insert into public.security_alerts (alert_type, severity, title, user_id)
    values ('new_device', 'low', 'Tentativa do dono', '11111111-1111-1111-1111-11111111a001');
    raise exception 'T5 FALHOU: agente A conseguiu INSERT em security_alerts';
  exception when insufficient_privilege then
    null; -- esperado: RLS nega a escrita
  end;

  update public.security_alerts set is_resolved = true, resolved_at = now()
   where id = '11111111-1111-1111-1111-0000000000a1';
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'T5 FALHOU: agente A resolveu % alerta(s) por UPDATE direto', v_n;
  end if;

  delete from public.security_alerts where id = '11111111-1111-1111-1111-0000000000a1';
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'T5 FALHOU: agente A apagou % alerta(s)', v_n;
  end if;
end $$;
reset role;

-- ===== T6: admin resolve e continua inserindo ================================
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-11111111c003","role":"authenticated"}';
set local role authenticated;
do $$
declare
  v_n        int;
  v_resolved boolean;
begin
  if current_user <> 'authenticated' then
    raise exception 'T6 FALHOU: papel efetivo %', current_user;
  end if;

  update public.security_alerts set is_resolved = true, resolved_at = now()
   where id = '11111111-1111-1111-1111-0000000000a1';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'T6 FALHOU: admin resolveu % linhas (esperava 1)', v_n;
  end if;

  select is_resolved into v_resolved from public.security_alerts
   where id = '11111111-1111-1111-1111-0000000000a1';
  if v_resolved is not true then
    raise exception 'T6 FALHOU: alerta nao ficou resolvido para o admin';
  end if;

  insert into public.security_alerts (id, alert_type, severity, title, user_id)
  values ('11111111-1111-1111-1111-0000000000c2', 'new_device', 'low', 'Inserido pelo admin', '11111111-1111-1111-1111-11111111b002');
end $$;
reset role;

-- ===== T7: estrutura da proteção ============================================
do $$
declare
  v_n    int;
  v_cmd  text;
  v_role text;
  v_qual text;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'security_alerts' and c.relrowsecurity) then
    raise exception 'T7 FALHOU: RLS desligado em security_alerts';
  end if;

  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'security_alerts';
  if v_n <> 3 then
    raise exception 'T7 FALHOU: esperava 3 policies em security_alerts, achei %', v_n;
  end if;

  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'security_alerts' and 'anon' = any (roles);
  if v_n <> 0 then
    raise exception 'T7 FALHOU: % policy(s) liberando anon em security_alerts', v_n;
  end if;

  select cmd, roles::text, qual into v_cmd, v_role, v_qual
    from pg_policies
   where schemaname = 'public' and tablename = 'security_alerts'
     and policyname = 'security_alerts_self_select';
  if v_cmd is null then
    raise exception 'T7 FALHOU: policy security_alerts_self_select ausente';
  end if;
  if v_cmd <> 'SELECT' or v_role <> '{authenticated}' then
    raise exception 'T7 FALHOU: policy nova com cmd=% roles=% (esperava SELECT/authenticated)', v_cmd, v_role;
  end if;
  if v_qual not like '%user_id%' or v_qual not like '%auth.uid()%' then
    raise exception 'T7 FALHOU: qual da policy nova nao filtra o dono: %', v_qual;
  end if;

  -- as duas policies de admin seguem vivas (nada foi afrouxado nem removido)
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'security_alerts'
     and policyname in ('Admins can manage security alerts', 'Admins can insert security alerts');
  if v_n <> 2 then
    raise exception 'T7 FALHOU: policies de admin alteradas (achei % de 2)', v_n;
  end if;
end $$;

-- ===== T8: rollback de verdade ==============================================
-- Roda o `drop policy` do cabeçalho da migration: o conserto tem de sumir.
drop policy if exists security_alerts_self_select on public.security_alerts;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-11111111a001","role":"authenticated"}';
set local role authenticated;
do $$
declare
  v_n int;
begin
  select count(*) into v_n from public.security_alerts;
  if v_n <> 0 then
    raise exception 'T8 FALHOU: apos o rollback o agente A ainda ve % alertas — rollback de fachada', v_n;
  end if;
end $$;
reset role;

rollback;
