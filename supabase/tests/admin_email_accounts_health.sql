-- Teste de regressao da RPC de saude das contas de e-mail do painel admin
-- (paridade V3 -> V2, 11/10/2026)
-- Ref: painel admin do V3 -> public.admin_email_accounts_health()
--      (supabase/migrations/20261011200753_admin_email_accounts_health.sql)
--
-- COMO RODAR (leia antes de confiar no resultado):
--   zapp-db-local psql . admin_email_accounts_health < supabase/tests/admin_email_accounts_health.sql
-- Roda como postgres no banco LOCAL do cartao (nunca producao). Todo o corpo esta em UMA
-- transacao que termina em ROLLBACK: as fixtures abaixo nao ficam no banco.
--
-- O QUE ESTE TESTE PROVA:
--   T1   forma da funcao: SECURITY DEFINER, STABLE, search_path fixo, sem argumentos;
--   T2   ACL: sem EXECUTE para PUBLIC/anon, com EXECUTE para authenticated;
--   T3   matriz de PERMISSAO com papeis REAIS (role + claims): anon negado pela ACL,
--        authenticated NAO admin negado pela guarda (42501), admin autorizado;
--   T4   comportamento com um admin: status do token derivado (sem_token/expirado/
--        expirando/valido), dono (nome/e-mail do profiles), ultimo sincronismo, falhas
--        recentes (last_error + em_falha) e ultima validacao; e que NENHUM byte de token
--        aparece no retorno.
-- Sem EXCEPTION no fim = suite verde. Cada assertiva sai como linha (test/result).

begin;
create temp table _res (ordem int, test text, result text, detalhe text) on commit drop;

-- =====================================================================================
-- T1: forma da funcao
-- =====================================================================================
do $$
declare
  v_sec boolean; v_vol "char"; v_cfg text[]; v_ret text; v_n int;
begin
  select p.prosecdef, p.provolatile, p.proconfig, pg_get_function_result(p.oid)
    into v_sec, v_vol, v_cfg, v_ret
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_email_accounts_health'
     and pg_get_function_identity_arguments(p.oid) = '';

  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_email_accounts_health';

  insert into _res values (1, 'T1a admin_email_accounts_health existe com a assinatura ()',
    case when v_n = 1 then 'PASS' else 'FAIL' end, 'overloads=' || v_n);
  insert into _res values (2, 'T1b e SECURITY DEFINER', case when v_sec then 'PASS' else 'FAIL' end, null);
  insert into _res values (3, 'T1c e STABLE (leitura)', case when v_vol = 's' then 'PASS' else 'FAIL' end, 'volatile=' || coalesce(v_vol::text,'<vazio>'));
  insert into _res values (4, 'T1d fixa search_path em pg_catalog, public',
    case when 'search_path=pg_catalog, public' = any(coalesce(v_cfg, '{}'::text[])) then 'PASS' else 'FAIL' end,
    'proconfig=' || coalesce(v_cfg::text, '<vazio>'));
  insert into _res values (5, 'T1e o retorno NAO expoe coluna bytea (token cifrado)',
    case when v_ret is not null and v_ret not ilike '%bytea%' then 'PASS' else 'FAIL' end,
    'ret=' || coalesce(v_ret, '<ausente>'));
end $$;

-- =====================================================================================
-- T2: ACL
-- =====================================================================================
do $$
declare v_pub int;
begin
  insert into _res values (6, 'T2a anon NAO pode executar a RPC',
    case when not has_function_privilege('anon', 'public.admin_email_accounts_health()', 'EXECUTE') then 'PASS' else 'FAIL' end, null);
  insert into _res values (7, 'T2b authenticated PODE executar a RPC (a guarda decide depois)',
    case when has_function_privilege('authenticated', 'public.admin_email_accounts_health()', 'EXECUTE') then 'PASS' else 'FAIL' end, null);

  select count(*) into v_pub
    from pg_proc p cross join lateral aclexplode(p.proacl) a
   where p.proname = 'admin_email_accounts_health' and a.grantee = 0;
  insert into _res values (8, 'T2c a RPC nao concede EXECUTE a PUBLIC', case when v_pub = 0 then 'PASS' else 'FAIL' end, 'grants_public=' || v_pub);
end $$;

-- =====================================================================================
-- fixtures (postgres; triggers/FK desligados) — tudo dentro da transacao, some no ROLLBACK
-- =====================================================================================
set local session_replication_role = replica;

insert into auth.users (id) values
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333')
on conflict (id) do nothing;

insert into public.profiles (id, user_id, name, email, created_at, updated_at)
values
  ('a2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Dono Alfa',  'dono.alfa@example.invalid',  now(), now()),
  ('a2000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'Dono Bravo', 'dono.bravo@example.invalid', now(), now())
on conflict (id) do update set name = excluded.name, email = excluded.email;

insert into public.gmail_accounts
  (id, user_id, email_address, is_active, sync_status, last_sync_at, last_error,
   token_expires_at, access_token_encrypted, refresh_token_encrypted, watch_expiration,
   created_at, updated_at)
values
  -- sem_token: desconectada (tokens zerados pelo disconnect), inativa
  ('b2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'zz-teste-health-semtoken@example.invalid', false, 'idle', null, 'conta desconectada',
   null, null, null, null, now() - interval '30 days', now() - interval '30 days'),
  -- expirado: refresh presente, validade no passado, sync em erro
  ('b2000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   'zz-teste-health-expirado@example.invalid', true, 'error', now() - interval '2 hours', 'invalid_grant ao renovar',
   now() - interval '1 hour', '\x01'::bytea, '\x02'::bytea, null, now() - interval '10 days', now() - interval '2 hours'),
  -- expirando: vence em 5 min
  ('b2000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333',
   'zz-teste-health-expirando@example.invalid', true, 'synced', now() - interval '1 minute', null,
   now() + interval '5 minutes', '\x03'::bytea, '\x04'::bytea, now() + interval '6 days', now() - interval '1 minute', now() - interval '1 minute'),
  -- valido: vence em 1h, sincronizada ha pouco
  ('b2000000-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333',
   'zz-teste-health-valido@example.invalid', true, 'synced', now() - interval '3 minutes', null,
   now() + interval '1 hour', '\x05'::bytea, '\x06'::bytea, now() + interval '6 days', now() - interval '20 days', now() - interval '3 minutes')
on conflict (id) do update
  set is_active = excluded.is_active, sync_status = excluded.sync_status, last_sync_at = excluded.last_sync_at,
      last_error = excluded.last_error, token_expires_at = excluded.token_expires_at,
      access_token_encrypted = excluded.access_token_encrypted, refresh_token_encrypted = excluded.refresh_token_encrypted,
      updated_at = excluded.updated_at;

set local session_replication_role = origin;

-- =====================================================================================
-- T3: matriz de permissao com papeis REAIS
-- =====================================================================================
do $$
declare
  c_admin uuid;
  c_agente constant uuid := '99999999-9999-4999-8999-999999999999'; -- sem linha em user_roles
  v_n int; v_res text;
begin
  select user_id into c_admin from public.user_roles where role = 'admin' limit 1;
  if c_admin is null then
    insert into _res values (10, 'T3 matriz de permissao', 'SKIP', 'conjunto local sem usuario admin');
    return;
  end if;

  -- T3a: anon NAO executa (ACL), mesmo com claims de anon
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  begin
    perform public.admin_email_accounts_health();
    reset role;
    insert into _res values (10, 'T3a anon NAO executa a RPC (ACL)', 'FAIL', 'executou');
  exception when insufficient_privilege then
    reset role;
    insert into _res values (10, 'T3a anon NAO executa a RPC (ACL)', 'PASS', 'permission denied');
  when others then
    reset role;
    insert into _res values (10, 'T3a anon NAO executa a RPC (ACL)', 'FAIL', 'erro inesperado: ' || sqlerrm);
  end;

  -- T3b: authenticated NAO admin e recusado pela GUARDA (42501), nao pela RLS
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c_agente), true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.admin_email_accounts_health();
    reset role;
    insert into _res values (11, 'T3b authenticated nao-admin e recusado pela guarda', 'FAIL', 'conseguiu: vazou para nao-admin');
  exception when insufficient_privilege then
    reset role;
    insert into _res values (11, 'T3b authenticated nao-admin e recusado pela guarda', 'PASS', '42501');
  when others then
    reset role;
    insert into _res values (11, 'T3b authenticated nao-admin e recusado pela guarda', 'FAIL', 'erro inesperado: ' || sqlerrm);
  end;

  -- T3c: admin autorizado e ve as contas de TODOS os donos
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c_admin), true);
  perform set_config('role', 'authenticated', true);
  begin
    select count(*) into v_n from public.admin_email_accounts_health() where conta like 'zz-teste-health-%';
    reset role;
    insert into _res values (12, 'T3c admin autorizado lista as contas (visao global)', case when v_n = 4 then 'PASS' else 'FAIL' end, 'n=' || v_n);
  exception when others then
    reset role;
    insert into _res values (12, 'T3c admin autorizado lista as contas (visao global)', 'FAIL', 'erro inesperado: ' || sqlerrm);
  end;
end $$;

-- =====================================================================================
-- T4: comportamento (como admin)
-- =====================================================================================
do $$
declare
  c_admin uuid;
  v_status text; v_nome text; v_mail text; v_sync timestamptz; v_falha text; v_emf boolean;
  v_valida timestamptz; v_upd timestamptz; v_n int; v_first text;
begin
  select user_id into c_admin from public.user_roles where role = 'admin' limit 1;
  if c_admin is null then
    insert into _res values (20, 'T4 comportamento', 'SKIP', 'conjunto local sem usuario admin');
    return;
  end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c_admin), true);

  -- T4a: status do token derivado
  select token_status into v_status from public.admin_email_accounts_health() where conta = 'zz-teste-health-semtoken@example.invalid';
  insert into _res values (20, 'T4a conta desconectada => sem_token', case when v_status = 'sem_token' then 'PASS' else 'FAIL' end, 'status=' || coalesce(v_status,'<vazio>'));

  select token_status into v_status from public.admin_email_accounts_health() where conta = 'zz-teste-health-expirado@example.invalid';
  insert into _res values (21, 'T4b validade no passado => expirado', case when v_status = 'expirado' then 'PASS' else 'FAIL' end, 'status=' || coalesce(v_status,'<vazio>'));

  select token_status into v_status from public.admin_email_accounts_health() where conta = 'zz-teste-health-expirando@example.invalid';
  insert into _res values (22, 'T4c validade em ate 15 min => expirando', case when v_status = 'expirando' then 'PASS' else 'FAIL' end, 'status=' || coalesce(v_status,'<vazio>'));

  select token_status into v_status from public.admin_email_accounts_health() where conta = 'zz-teste-health-valido@example.invalid';
  insert into _res values (23, 'T4d validade futura => valido', case when v_status = 'valido' then 'PASS' else 'FAIL' end, 'status=' || coalesce(v_status,'<vazio>'));

  -- T4e: dono (nome/e-mail) vem do profiles do user_id
  select dono_nome, dono_email into v_nome, v_mail
    from public.admin_email_accounts_health() where conta = 'zz-teste-health-valido@example.invalid';
  insert into _res values (24, 'T4e dono nome/e-mail casam com o profiles',
    case when v_nome = 'Dono Bravo' and v_mail = 'dono.bravo@example.invalid' then 'PASS' else 'FAIL' end,
    'nome=' || coalesce(v_nome,'<vazio>') || ' email=' || coalesce(v_mail,'<vazio>'));

  -- T4f: ultimo sincronismo = last_sync_at persistido
  select ultimo_sincronismo, falhas_recentes, em_falha, ultima_validacao
    into v_sync, v_falha, v_emf, v_valida
    from public.admin_email_accounts_health() where conta = 'zz-teste-health-expirado@example.invalid';
  select last_sync_at into v_upd from public.gmail_accounts where email_address = 'zz-teste-health-expirado@example.invalid';
  insert into _res values (25, 'T4f ultimo sincronismo reflete last_sync_at', case when v_sync = v_upd then 'PASS' else 'FAIL' end, 'sync=' || coalesce(v_sync::text,'<null>'));
  insert into _res values (26, 'T4g falhas recentes guarda a ultima falha (last_error)', case when v_falha = 'invalid_grant ao renovar' then 'PASS' else 'FAIL' end, 'falha=' || coalesce(v_falha,'<null>'));
  insert into _res values (27, 'T4h sync_status=error marca em_falha', case when v_emf then 'PASS' else 'FAIL' end, null);
  insert into _res values (28, 'T4i ultima validacao reflete updated_at', case when v_valida is not null then 'PASS' else 'FAIL' end, 'validacao=' || coalesce(v_valida::text,'<null>'));

  -- T4j: conta sincronizada e sem erro fica sem falha
  select falhas_recentes, em_falha into v_falha, v_emf from public.admin_email_accounts_health() where conta = 'zz-teste-health-valido@example.invalid';
  insert into _res values (29, 'T4j conta saudavel nao tem falha', case when v_falha is null and not v_emf then 'PASS' else 'FAIL' end, 'falha=' || coalesce(v_falha,'<null>'));

  -- T4k: ordenacao por is_active desc -> a inativa fica por ultimo
  select conta into v_first from public.admin_email_accounts_health() where conta like 'zz-teste-health-%' order by is_active desc, conta asc limit 1;
  insert into _res values (30, 'T4k conta ativa vem antes da inativa', case when v_first <> 'zz-teste-health-semtoken@example.invalid' then 'PASS' else 'FAIL' end, 'primeira=' || coalesce(v_first,'<vazio>'));

  -- T4l: o retorno nao carrega o token; so booleanos de presenca
  select count(*) into v_n
    from public.admin_email_accounts_health()
   where conta like 'zz-teste-health-%'
     and ((tem_refresh_token and conta in ('zz-teste-health-expirado@example.invalid','zz-teste-health-expirando@example.invalid','zz-teste-health-valido@example.invalid'))
          or (not tem_refresh_token and conta = 'zz-teste-health-semtoken@example.invalid'));
  insert into _res values (31, 'T4l presenca de token vem so como booleano', case when v_n = 4 then 'PASS' else 'FAIL' end, 'n=' || v_n);
end $$;

select ordem, test, result, detalhe from _res order by ordem;

do $$
declare v_fail int;
begin
  select count(*) into v_fail from _res where result = 'FAIL';
  if v_fail > 0 then
    raise exception 'admin_email_accounts_health: % assertiva(s) FALHOU', v_fail;
  end if;
  raise notice 'admin_email_accounts_health: % assertivas, todas PASS', (select count(*) from _res where result <> 'SKIP');
end $$;

rollback;
