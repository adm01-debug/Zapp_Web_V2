-- Teste de regressao das RPCs de leitura do painel de auth (paridade V3 -> V2, 11/10/2026)
-- Ref: painel admin do V3 (AdminFailedAuthMessagesPage) -> public.admin_login_attempts /
--      public.admin_blocked_accounts (supabase/migrations/20261011192817_admin_login_attempts_rpc.sql)
--
-- COMO RODAR (leia antes de confiar no resultado):
--   zapp-db-local psql . <nome-do-conjunto> < supabase/tests/admin_login_attempts.sql
-- Roda como postgres no banco LOCAL do cartao (nunca producao). Todo o corpo esta em UMA
-- transacao que termina em ROLLBACK: as fixtures abaixo nao ficam no banco.
--
-- O QUE ESTE TESTE PROVA:
--   T1/T2  forma e ACL das duas funcoes (SECURITY DEFINER, search_path, STABLE; sem
--          EXECUTE para PUBLIC/anon, com EXECUTE para authenticated);
--   T3     postura de RLS de public.login_attempts (ligada, sem policy permissiva,
--          INSERT/UPDATE barrados para authenticated);
--   T4     matriz de PERMISSAO com papeis REAIS (SET ROLE authenticated/anon + claims):
--          UUIDs fixos conferidos, anon negado, agente e supervisor negados pela guarda, admin autorizado; leitura
--          direta da tabela: agente ve 0 linhas, admin ve as linhas, anon sem permissao;
--   T5     comportamento da consulta: periodo, filtro por email (curinga NAO vale),
--          recorte de forca bruta, paginacao/ordenacao/total e entrada invalida;
--   T6     admin_blocked_accounts: so bloqueio vigente, motivo derivado.
-- Sem EXCEPTION no fim = suite verde. Cada assertiva sai como linha (test/result).

begin;
create temp table _res (ordem int, test text, result text, detalhe text) on commit drop;

-- =====================================================================================
-- T1/T2: forma e ACL das funcoes
-- =====================================================================================
do $$
declare
  v_sec boolean; v_vol "char"; v_cfg text[]; v_n int;
begin
  select p.prosecdef, p.provolatile, p.proconfig into v_sec, v_vol, v_cfg
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_login_attempts'
     and pg_get_function_identity_arguments(p.oid) = 'p_periodo text, p_email_like text, p_so_falhas boolean, p_pagina integer';
  insert into _res values (1, 'T1a admin_login_attempts existe com a assinatura do painel',
    case when v_sec is not null then 'PASS' else 'FAIL' end, 'prosecdef=' || coalesce(v_sec::text,'<ausente>'));

  insert into _res values (2, 'T1b admin_login_attempts e SECURITY DEFINER', case when v_sec then 'PASS' else 'FAIL' end, null);
  insert into _res values (3, 'T1c admin_login_attempts e STABLE (leitura)', case when v_vol = 's' then 'PASS' else 'FAIL' end, 'provolatile=' || coalesce(v_vol::text,'?'));
  insert into _res values (4, 'T1d admin_login_attempts fixa search_path com pg_catalog e public',
    case when v_cfg is not null and exists (select 1 from unnest(v_cfg) c where c like 'search_path=%pg_catalog%' and c like '%public%')
         then 'PASS' else 'FAIL' end, 'proconfig=' || coalesce(v_cfg::text,'<nulo>'));

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_blocked_accounts'
     and pg_get_function_identity_arguments(p.oid) = '';
  insert into _res values (5, 'T1e admin_blocked_accounts existe sem argumentos', case when v_n = 1 then 'PASS' else 'FAIL' end, 'n=' || v_n);

  -- ACL: PUBLIC/anon fora, authenticated dentro
  insert into _res values (6, 'T2a anon NAO pode executar admin_login_attempts',
    case when not has_function_privilege('anon', 'public.admin_login_attempts(text,text,boolean,integer)', 'EXECUTE') then 'PASS' else 'FAIL' end, null);
  insert into _res values (7, 'T2b anon NAO pode executar admin_blocked_accounts',
    case when not has_function_privilege('anon', 'public.admin_blocked_accounts()', 'EXECUTE') then 'PASS' else 'FAIL' end, null);
  insert into _res values (8, 'T2c authenticated PODE executar as duas (guarda decide depois)',
    case when has_function_privilege('authenticated', 'public.admin_login_attempts(text,text,boolean,integer)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.admin_blocked_accounts()', 'EXECUTE') then 'PASS' else 'FAIL' end, null);
  insert into _res values (9, 'T2d nenhuma das duas concede EXECUTE a PUBLIC',
    case when not exists (
      select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
       where p.proname in ('admin_login_attempts','admin_blocked_accounts') and a.grantee = 0)
    then 'PASS' else 'FAIL' end, null);
end $$;

-- =====================================================================================
-- T3: postura de RLS da tabela (o item "conferir RLS de login_attempts")
-- =====================================================================================
do $$
declare v_rls boolean; v_select int; v_perm int; v_ins_deny int; v_anon int;
begin
  select relrowsecurity into v_rls from pg_class where oid = 'public.login_attempts'::regclass;
  insert into _res values (10, 'T3a public.login_attempts tem RLS ligada', case when v_rls then 'PASS' else 'FAIL' end, null);

  select count(*) into v_select from pg_policies where schemaname='public' and tablename='login_attempts' and cmd='SELECT';
  insert into _res values (11, 'T3b existe exatamente uma policy de SELECT (sem leitura por OR de policies)',
    case when v_select = 1 then 'PASS' else 'FAIL' end, 'policies_select=' || v_select);

  -- nenhuma policy permissiva residual (USING true / WITH CHECK true) — foi o defeito "System can manage login attempts"
  select count(*) into v_perm from pg_policies
   where schemaname='public' and tablename='login_attempts'
     and (coalesce(qual,'false') = 'true' or coalesce(with_check,'false') = 'true');
  insert into _res values (12, 'T3c nenhuma policy permissiva (USING/WITH CHECK true) sobrou', case when v_perm = 0 then 'PASS' else 'FAIL' end, 'permissivas=' || v_perm);

  select count(*) into v_ins_deny from pg_policies
   where schemaname='public' and tablename='login_attempts' and cmd='INSERT' and coalesce(with_check,'false') = 'false';
  insert into _res values (13, 'T3d INSERT de authenticated e negado (WITH CHECK false)', case when v_ins_deny >= 1 then 'PASS' else 'FAIL' end, 'policies_insert_deny=' || v_ins_deny);

  select count(*) into v_anon from pg_policies where schemaname='public' and tablename='login_attempts' and 'anon' = any(roles);
  insert into _res values (14, 'T3e nenhuma policy concede acesso a anon', case when v_anon = 0 then 'PASS' else 'FAIL' end, 'policies_anon=' || v_anon);
end $$;

-- =====================================================================================
-- fixtures (postgres, sem RLS) — todas dentro da transacao, somem no ROLLBACK
-- =====================================================================================
insert into public.login_attempts (email, ip_address, user_agent, attempt_count, last_attempt_at, locked_until)
values
  ('zz-teste-login-a@example.invalid', '203.0.113.7',  'teste/1.0', 7, now() - interval '2 hours',  now() + interval '10 minutes'),
  ('zz-teste-login-b@example.invalid', '203.0.113.8',  'teste/1.0', 2, now() - interval '3 hours',  null),
  ('zz-teste-login-c@example.invalid', '203.0.113.9',  'teste/1.0', 5, now() - interval '5 days',   null),
  ('zz-teste-login-d@example.invalid', null,           null,        9, now() - interval '40 days',  now() + interval '1 hour'),
  ('zz-teste-manual@example.invalid',  '203.0.113.11', 'teste/1.0', 3, now() - interval '4 hours',  now() + interval '5 minutes'),
  ('zz-teste-percent%x@example.invalid','203.0.113.10','teste/1.0', 6, now() - interval '1 hour',   null)
on conflict (email) do update
  set attempt_count = excluded.attempt_count, last_attempt_at = excluded.last_attempt_at,
      locked_until = excluded.locked_until, ip_address = excluded.ip_address, user_agent = excluded.user_agent;

-- 30 linhas para exercitar a paginacao (tamanho de pagina = 25) e a ordenacao
insert into public.login_attempts (email, attempt_count, last_attempt_at)
select 'zz-teste-pagina-' || lpad(g::text, 2, '0') || '@example.invalid', 6, now() - make_interval(mins => g)
  from generate_series(1, 30) g
on conflict (email) do update
  set attempt_count = excluded.attempt_count, last_attempt_at = excluded.last_attempt_at, locked_until = null;

-- =====================================================================================
-- T4: matriz de permissao com papeis REAIS
-- =====================================================================================
-- Fixtures obrigatorias da matriz: os UUIDs usados nos JWTs abaixo recebem papeis
-- conhecidos nesta transacao. Se qualquer papel fixo nao bater, a suite FALHA (nao SKIP).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-login-attempts-admin@local.test', '', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'admin-login-attempts-supervisor@local.test', '', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'admin-login-attempts-agent@local.test', '', now(), now(), now())
on conflict (id) do nothing;

delete from public.user_roles
 where user_id in (
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000004'
 );

insert into public.user_roles (user_id, role)
values
  ('00000000-0000-4000-8000-000000000001', 'admin'),
  ('00000000-0000-4000-8000-000000000003', 'supervisor'),
  ('00000000-0000-4000-8000-000000000004', 'agent');

do $$
declare
  c_admin constant text := '00000000-0000-4000-8000-000000000001';
  c_sup   constant text := '00000000-0000-4000-8000-000000000003';
  c_agent constant text := '00000000-0000-4000-8000-000000000004';
  v_claims text;
  v_n int; v_res text;
begin
  -- sanidade obrigatoria: os UUIDs fixos precisam ter exatamente o papel usado no JWT
  insert into _res values (15, 'T4 fixture c_admin e admin',
    case when exists (select 1 from public.user_roles where user_id = c_admin::uuid and role = 'admin')
         and public.is_admin(c_admin::uuid) then 'PASS' else 'FAIL' end, 'admin=' || c_admin);
  insert into _res values (16, 'T4 fixture c_sup e supervisor e NAO admin',
    case when exists (select 1 from public.user_roles where user_id = c_sup::uuid and role = 'supervisor')
         and not public.is_admin(c_sup::uuid) then 'PASS' else 'FAIL' end, 'supervisor=' || c_sup);
  insert into _res values (17, 'T4 fixture c_agent e agent e NAO admin/supervisor',
    case when exists (select 1 from public.user_roles where user_id = c_agent::uuid and role = 'agent')
         and not public.is_admin(c_agent::uuid)
         and not public.is_admin_or_supervisor(c_agent::uuid) then 'PASS' else 'FAIL' end, 'agent=' || c_agent);

  v_claims := format('{"sub":"%s","role":"authenticated"}', c_admin);

  -- T4a: admin autorizado
  perform set_config('request.jwt.claims', v_claims, true);
  begin
    perform public.admin_login_attempts('24h', 'zz-teste-login', false, 1);
    v_res := 'PASS';
  exception when others then v_res := 'FAIL'; end;
  insert into _res values (20, 'T4a admin autenticado consulta as tentativas', v_res, 'admin=' || c_admin);

  -- T4b: supervisor autenticado tambem e recusado; as RPCs deste cartao sao so admin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c_sup), true);
  begin
    perform public.admin_login_attempts('24h', 'zz-teste-login', false, 1);
    v_res := 'FAIL';   -- conseguiu: vazou para supervisor
  exception when insufficient_privilege then v_res := 'PASS';
    when others then v_res := 'FAIL';
  end;
  insert into _res values (21, 'T4b supervisor autenticado NAO consulta as tentativas', v_res, 'supervisor=' || c_sup);

  begin
    perform public.admin_blocked_accounts();
    v_res := 'FAIL';
  exception when insufficient_privilege then v_res := 'PASS';
    when others then v_res := 'FAIL';
  end;
  insert into _res values (22, 'T4c supervisor autenticado NAO lista bloqueadas', v_res, null);

  -- T4d/T4e: agente (authenticated NAO admin) recusado pela guarda -> 42501
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c_agent), true);
  begin
    perform public.admin_login_attempts('24h', null, false, 1);
    v_res := 'FAIL';   -- conseguiu: vazou para nao-admin
  exception when insufficient_privilege then v_res := 'PASS';
    when others then v_res := 'FAIL';
  end;
  insert into _res values (23, 'T4d agente NAO admin e recusado pela guarda', v_res, 'agent=' || c_agent);

  begin
    perform public.admin_blocked_accounts();
    v_res := 'FAIL';
  exception when insufficient_privilege then v_res := 'PASS';
    when others then v_res := 'FAIL';
  end;
  insert into _res values (24, 'T4e agente NAO admin nao lista bloqueadas', v_res, null);

  -- T4e..T4h: leitura DIRETA da tabela com papeis reais (RLS de verdade)
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c_agent), true);
  perform set_config('role', 'authenticated', true);
  begin
    select count(*) into v_n from public.login_attempts;
    reset role;
    insert into _res values (25, 'T4f agente le 0 linhas direto na tabela (RLS)', case when v_n = 0 then 'PASS' else 'FAIL' end, 'count=' || v_n);
  exception when others then
    reset role;
    insert into _res values (25, 'T4f agente le 0 linhas direto na tabela (RLS)', 'FAIL', 'erro inesperado: ' || sqlerrm);
  end;
  reset role;

  perform set_config('role', 'anon', true);
  begin
    select count(*) into v_n from public.login_attempts;
    reset role;
    insert into _res values (26, 'T4g anon nao le a tabela direto', 'FAIL', 'leu ' || v_n || ' linha(s)');
  exception when insufficient_privilege then
    reset role;
    insert into _res values (26, 'T4g anon nao le a tabela direto', 'PASS', 'permission denied');
  when others then
    reset role;
    insert into _res values (26, 'T4g anon nao le a tabela direto', 'FAIL', 'erro inesperado: ' || sqlerrm);
  end;

  perform set_config('request.jwt.claims', v_claims, true);
  perform set_config('role', 'authenticated', true);
  begin
    select count(*) into v_n from public.login_attempts;
    reset role;
    insert into _res values (27, 'T4h admin le as linhas direto na tabela', case when v_n > 0 then 'PASS' else 'FAIL' end, 'count=' || v_n);
  exception when others then
    reset role;
    insert into _res values (27, 'T4h admin le as linhas direto na tabela', 'FAIL', 'erro inesperado: ' || sqlerrm);
  end;

  -- T4h: anon nem chega na funcao (EXECUTE negado), mesmo sem JWT
  perform set_config('role', 'anon', true);
  begin
    perform public.admin_login_attempts();
    reset role;
    insert into _res values (28, 'T4i anon nao executa a RPC', 'FAIL', 'executou');
  exception when insufficient_privilege then
    reset role;
    insert into _res values (28, 'T4i anon nao executa a RPC', 'PASS', 'permission denied');
  when others then
    reset role;
    insert into _res values (28, 'T4i anon nao executa a RPC', 'FAIL', 'erro inesperado: ' || sqlerrm);
  end;
end $$;

-- =====================================================================================
-- T5: comportamento (postgres + claims de admin)
-- =====================================================================================
do $$
declare
  c_admin constant text := '00000000-0000-4000-8000-000000000001';
  v_n int; v_total bigint; v_first text; v_last text; v_res text; v_errcode text;
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c_admin), true);

  -- T5a: periodo 7d, filtro do assunto, so_falhas=false -> a, b, c (d tem 40 dias)
  select count(*), max(total_linhas) into v_n, v_total
    from public.admin_login_attempts('7d', 'zz-teste-login', false, 1);
  insert into _res values (30, 'T5a periodo 7d respeita a janela (3 de 4 linhas do assunto)',
    case when v_n = 3 and v_total = 3 then 'PASS' else 'FAIL' end, 'n=' || v_n || ' total=' || v_total);

  -- T5b: so_falhas=true -> so as que passaram do limiar (a=7, c=5)
  select count(*) into v_n from public.admin_login_attempts('7d', 'zz-teste-login', true, 1);
  insert into _res values (31, 'T5b so_falhas=true devolve so contas no limiar de forca bruta',
    case when v_n = 2 then 'PASS' else 'FAIL' end, 'n=' || v_n);

  -- T5c: periodo 24h -> a e b
  select count(*) into v_n from public.admin_login_attempts('24h', 'zz-teste-login', false, 1);
  insert into _res values (32, 'T5c periodo 24h corta o que e mais antigo', case when v_n = 2 then 'PASS' else 'FAIL' end, 'n=' || v_n);

  -- T5d: ordenacao por ultima tentativa desc
  select email into v_first from public.admin_login_attempts('24h', 'zz-teste-login', false, 1) limit 1;
  insert into _res values (33, 'T5d ordena pela tentativa mais recente primeiro',
    case when v_first = 'zz-teste-login-a@example.invalid' then 'PASS' else 'FAIL' end, 'primeiro=' || coalesce(v_first,'<vazio>'));

  -- T5e: paginacao real (30 linhas, pagina 25): p1=25, p2=5, total=30 nas duas
  select count(*), max(total_linhas) into v_n, v_total from public.admin_login_attempts('all', 'zz-teste-pagina-', false, 1);
  insert into _res values (34, 'T5e pagina 1 devolve 25 e informa o total 30',
    case when v_n = 25 and v_total = 30 then 'PASS' else 'FAIL' end, 'n=' || v_n || ' total=' || v_total);
  select count(*), max(total_linhas) into v_n, v_total from public.admin_login_attempts('all', 'zz-teste-pagina-', false, 2);
  insert into _res values (35, 'T5f pagina 2 devolve os 5 restantes',
    case when v_n = 5 and v_total = 30 then 'PASS' else 'FAIL' end, 'n=' || v_n || ' total=' || v_total);

  -- T5g: nenhuma linha repetida entre as paginas
  select count(distinct email) into v_total from (
    select email from public.admin_login_attempts('all', 'zz-teste-pagina-', false, 1)
    union all
    select email from public.admin_login_attempts('all', 'zz-teste-pagina-', false, 2)) x;
  insert into _res values (36, 'T5g as duas paginas nao repetem linha', case when v_total = 30 then 'PASS' else 'FAIL' end, 'distintos=' || v_total);

  -- T5h: '%' NAO e curinga (busca por subcadeia literal)
  select count(*) into v_n from public.admin_login_attempts('7d', '%', false, 1);
  insert into _res values (37, 'T5h o filtro de email nao trata % como curinga', case when v_n = 1 then 'PASS' else 'FAIL' end, 'n=' || v_n);
  select count(*) into v_n from public.admin_login_attempts('7d', 'zz-teste-percent%x', false, 1);
  insert into _res values (38, 'T5i o filtro acha o email com % literal', case when v_n = 1 then 'PASS' else 'FAIL' end, 'n=' || v_n);

  -- T5j..T5m: entrada invalida -> 22023
  begin
    perform public.admin_login_attempts('2d', null, false, 1);
    v_res := 'FAIL';
  exception when sqlstate '22023' then v_res := 'PASS'; when others then v_res := 'FAIL'; end;
  insert into _res values (39, 'T5j periodo invalido e recusado (22023)', v_res, null);

  begin
    perform public.admin_login_attempts('7d', null, false, 0);
    v_res := 'FAIL';
  exception when sqlstate '22023' then v_res := 'PASS'; when others then v_res := 'FAIL'; end;
  insert into _res values (40, 'T5k pagina < 1 e recusada (22023)', v_res, null);

  begin
    perform public.admin_login_attempts('7d', null, false, 4001);
    v_res := 'FAIL';
  exception when sqlstate '22023' then v_res := 'PASS'; when others then v_res := 'FAIL'; end;
  insert into _res values (41, 'T5l pagina acima do teto e recusada (22023)', v_res, null);

  begin
    perform public.admin_login_attempts('7d', repeat('a', 300), false, 1);
    v_res := 'FAIL';
  exception when sqlstate '22023' then v_res := 'PASS'; when others then v_res := 'FAIL'; end;
  insert into _res values (42, 'T5m filtro de email longo demais e recusado (22023)', v_res, null);
end $$;

-- =====================================================================================
-- T6: contas bloqueadas agora
-- =====================================================================================
do $$
declare
  c_admin constant text := '00000000-0000-4000-8000-000000000001';
  v_n int; v_motivo text; v_res text;
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c_admin), true);

  select count(*) into v_n from public.admin_blocked_accounts() where email like 'zz-teste-%';
  insert into _res values (50, 'T6a só contas com bloqueio vigente entram', case when v_n = 3 then 'PASS' else 'FAIL' end, 'n=' || v_n);

  select count(*) into v_n from public.admin_blocked_accounts() where email in ('zz-teste-login-b@example.invalid','zz-teste-login-c@example.invalid');
  insert into _res values (51, 'T6b conta so com falhas (sem lock vigente) fica fora', case when v_n = 0 then 'PASS' else 'FAIL' end, 'n=' || v_n);

  select motivo into v_motivo from public.admin_blocked_accounts() where email = 'zz-teste-login-a@example.invalid';
  insert into _res values (52, 'T6c motivo de forca bruta derivado da contagem',
    case when v_motivo = 'excesso_de_tentativas' then 'PASS' else 'FAIL' end, 'motivo=' || coalesce(v_motivo,'<vazio>'));

  select motivo into v_motivo from public.admin_blocked_accounts() where email = 'zz-teste-manual@example.invalid';
  insert into _res values (53, 'T6d bloqueio abaixo do limiar marcado como manual',
    case when v_motivo = 'bloqueio_manual' then 'PASS' else 'FAIL' end, 'motivo=' || coalesce(v_motivo,'<vazio>'));
end $$;

select ordem, test, result, detalhe from _res order by ordem;

do $$
declare v_fail int;
begin
  select count(*) into v_fail from _res where result = 'FAIL';
  if v_fail > 0 then
    raise exception 'admin_login_attempts: % assertiva(s) FALHOU', v_fail;
  end if;
  raise notice 'admin_login_attempts: % assertivas, todas PASS', (select count(*) from _res);
end $$;

rollback;
