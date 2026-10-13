-- ============================================================================
-- table_row_snapshots — prova do cartao t_f3fda8bb (SL-051)
--
-- O QUE PROVA (criterio de pronto do cartao):
--   T0) a tabela nova nasceu FECHADA: RLS ligada (relrowsecurity) e SEM GRANT de
--       tabela para anon/authenticated (so service_role le), conferido por
--       has_table_privilege;
--   T1) a FUNCAO de job public.capture_table_row_snapshots() grava UM retrato por
--       (dia, tabela) das 15 tabelas criticas, devolve 15 e e IDEMPOTENTE (rodar
--       de novo regrava o dia, nao duplica a linha);
--   T2) a mesma funcao aplica a RETENCAO de 90 dias: retrato com snapshot_date <
--       hoje-90 e apagado; o do dia hoje-90 (fronteira) e mantido;
--   T3) a RPC public.admin_table_row_snapshots(p_drop_pct) e somente leitura:
--         - anon  -> EXECUTE negado (42501);
--         - authenticated sem 'sub' -> not_authenticated (42501);
--         - authenticated agente     -> not_authorized (42501);
--         - authenticated admin      -> devolve as tabelas do ultimo dia;
--       e o SINAL funciona: queda percentual acima do limiar marca is_alert=true;
--       tabela estavel NAO alarma; limiar invalido (150) e recusado (22023).
--
-- COMO RODA (banco LOCAL descartavel da tarefa, com o schema real aplicado por
-- `hermes-db-migrar`). Fixtures e assercoes numa unica transacao que TERMINA EM
-- ROLLBACK: idempotente, sem efeito colateral.
--   zapp-db-local psql . v2-26101307016179 < supabase/tests/table_row_snapshots.sql
--
-- PAPEL REAL: enforcement exercido como anon/authenticated/service_role via
-- `SET LOCAL ROLE` + JWT sintetico em request.jwt.claims — o caminho do PostgREST,
-- nunca como postgres/superusuario. Os fixtures ficam em auth.users/user_roles
-- (zz_snap_*), removidos pelo ROLLBACK.
--
-- VERMELHO (a prova falha sem a protecao): passe `-v sem_migration=1` — a tabela e
-- as duas funcoes sao derrubadas DENTRO da transacao e T0/T1 falham logo na 1a
-- assercao (a funcao nao existe: 42883).
-- ============================================================================

\set ON_ERROR_STOP on

begin;

-- ── Modo vermelho: sem a migration, nada abaixo existe ──────────────────────
\if :{?sem_migration}
  drop function if exists public.admin_table_row_snapshots(numeric);
  drop function if exists public.capture_table_row_snapshots();
  drop table if exists public.table_row_snapshots;
  \echo '  [sem_migration] tabela e funcoes derrubadas dentro da transacao'
\endif

-- ── Helpers do proprio teste ────────────────────────────────────────────────
create function pg_temp.pega_erro(p_sql text) returns text
language plpgsql as $h$
declare v_txt text;
begin
  begin
    execute p_sql;
    return 'SEM ERRO';
  exception when others then
    return sqlstate || ' | ' || sqlerrm;
  end;
end $h$;

create function pg_temp.espera(p_label text, p_atual text, p_esperado text) returns void
language plpgsql as $h$
begin
  if p_atual is distinct from p_esperado then
    raise exception 'table_row_snapshots FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  end if;
  raise notice 'PASS [%] -> %', p_label, p_atual;
end $h$;

-- espera o SQLSTATE exato de pega_erro (o texto da mensagem pode variar por versao)
create function pg_temp.espera_erro(p_label text, p_sql text, p_sqlstate text) returns void
language plpgsql as $h$
declare v_res text := pg_temp.pega_erro(p_sql);
begin
  if v_res = 'SEM ERRO' or split_part(v_res, ' | ', 1) is distinct from p_sqlstate then
    raise exception 'table_row_snapshots FALHOU [%]: esperava SQLSTATE %, veio: %', p_label, p_sqlstate, v_res;
  end if;
  raise notice 'PASS [%] -> erro % como esperado', p_label, p_sqlstate;
end $h$;

grant execute on function pg_temp.pega_erro(text) to public;
grant execute on function pg_temp.espera(text, text, text) to public;
grant execute on function pg_temp.espera_erro(text, text, text) to public;

-- ── Fixtures de papel (zz_snap_*) ───────────────────────────────────────────
set session_replication_role = replica;
insert into auth.users (id) values
  ('aa000000-0000-0000-0000-0000000000a1'),  -- ADMIN
  ('bb000000-0000-0000-0000-0000000000b1');  -- AGENTE
insert into public.user_roles (user_id, role) values
  ('aa000000-0000-0000-0000-0000000000a1', 'admin'),
  ('bb000000-0000-0000-0000-0000000000b1', 'agent');
set session_replication_role = origin;

-- ── T0 — a tabela nova nasceu fechada ───────────────────────────────────────
select pg_temp.espera('T0 RLS ligada',
  (select relrowsecurity::text from pg_class where oid = 'public.table_row_snapshots'::regclass),
  'true');

select pg_temp.espera('T0 anon sem SELECT na tabela',
  has_table_privilege('anon', 'public.table_row_snapshots', 'SELECT')::text, 'false');
select pg_temp.espera('T0 authenticated sem SELECT na tabela',
  has_table_privilege('authenticated', 'public.table_row_snapshots', 'SELECT')::text, 'false');
select pg_temp.espera('T0 service_role le a tabela',
  has_table_privilege('service_role', 'public.table_row_snapshots', 'SELECT')::text, 'true');

select pg_temp.espera('T0 capture() so service_role (anon)',
  has_function_privilege('anon', 'public.capture_table_row_snapshots()', 'EXECUTE')::text, 'false');
select pg_temp.espera('T0 capture() so service_role (authenticated)',
  has_function_privilege('authenticated', 'public.capture_table_row_snapshots()', 'EXECUTE')::text, 'false');
select pg_temp.espera('T0 admin_rpc so authenticated+service (anon)',
  has_function_privilege('anon', 'public.admin_table_row_snapshots(numeric)', 'EXECUTE')::text, 'false');
select pg_temp.espera('T0 admin_rpc para authenticated',
  has_function_privilege('authenticated', 'public.admin_table_row_snapshots(numeric)', 'EXECUTE')::text, 'true');

select pg_temp.espera('T0 capture e SECURITY DEFINER',
  (select prosecdef::text from pg_proc where oid = 'public.capture_table_row_snapshots()'::regprocedure), 'true');
select pg_temp.espera('T0 admin_rpc e SECURITY DEFINER',
  (select prosecdef::text from pg_proc where oid = 'public.admin_table_row_snapshots(numeric)'::regprocedure), 'true');

set local role authenticated;
set local request.jwt.claims = '{}';
select pg_temp.espera_erro('T0 authenticated nao le a tabela direto (ACL)',
  'select 1 from public.table_row_snapshots', '42501');
reset role;

-- ── T1 — o job grava o retrato do dia (service_role), idempotente ───────────
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

select pg_temp.espera('T1 capture devolve 15',
  public.capture_table_row_snapshots()::text, '15');

select pg_temp.espera('T1 ha 15 retratos do dia',
  (select count(*)::text from public.table_row_snapshots
    where snapshot_date = (now() at time zone 'utc')::date), '15');

-- idempotencia: rodar de novo regrava o dia sem duplicar
select public.capture_table_row_snapshots();
select pg_temp.espera('T1 continua 15 retratos do dia (idempotente)',
  (select count(*)::text from public.table_row_snapshots
    where snapshot_date = (now() at time zone 'utc')::date), '15');

reset role;

-- ── T2 — retencao de 90 dias (fronteira) ────────────────────────────────────
insert into public.table_row_snapshots (snapshot_date, table_name, estimated_rows, exact_rows)
values
  ((now() at time zone 'utc')::date - 91, 'messages', 0, 1),   -- fora: sera apagado
  ((now() at time zone 'utc')::date - 90, 'messages', 0, 1);   -- fronteira: fica

set local role service_role;
select public.capture_table_row_snapshots();
reset role;

select pg_temp.espera('T2 retrato com 91 dias foi apagado',
  (select count(*)::text from public.table_row_snapshots
    where snapshot_date = (now() at time zone 'utc')::date - 91), '0');
select pg_temp.espera('T2 retrato na fronteira (90 dias) fica',
  (select count(*)::text from public.table_row_snapshots
    where snapshot_date = (now() at time zone 'utc')::date - 90), '1');

-- ── Base para o sinal da RPC: simula o dia anterior ─────────────────────────
-- contacts: ontem tinha 1000 linhas a mais que hoje -> queda > 20% -> alarme.
-- profiles: estavel -> nao alarma.
insert into public.table_row_snapshots (snapshot_date, table_name, estimated_rows, exact_rows)
select (now() at time zone 'utc')::date - 1, 'contacts', 0, s.exact_rows + 1000
  from public.table_row_snapshots s
 where s.snapshot_date = (now() at time zone 'utc')::date and s.table_name = 'contacts';
insert into public.table_row_snapshots (snapshot_date, table_name, estimated_rows, exact_rows)
select (now() at time zone 'utc')::date - 1, 'profiles', 0, s.exact_rows
  from public.table_row_snapshots s
 where s.snapshot_date = (now() at time zone 'utc')::date and s.table_name = 'profiles';

-- ── T3 — autorizacao e sinal da RPC admin ───────────────────────────────────
-- anon: sem EXECUTE
set local role anon;
select pg_temp.espera_erro('T3 anon nao executa a RPC',
  'select * from public.admin_table_row_snapshots(20)', '42501');
reset role;

-- authenticated sem sub -> not_authenticated
set local role authenticated;
set local request.jwt.claims = '{}';
select pg_temp.espera_erro('T3 authenticated sem sub -> not_authenticated',
  'select * from public.admin_table_row_snapshots(20)', '42501');

-- authenticated agente -> not_authorized
set local request.jwt.claims = '{"sub":"bb000000-0000-0000-0000-0000000000b1"}';
select pg_temp.espera_erro('T3 agente -> not_authorized',
  'select * from public.admin_table_row_snapshots(20)', '42501');

-- authenticated admin -> leitura e sinal
set local request.jwt.claims = '{"sub":"aa000000-0000-0000-0000-0000000000a1"}';

select pg_temp.espera('T3 admin ve as 15 tabelas do ultimo dia',
  (select count(*)::text from public.admin_table_row_snapshots(20)), '15');

do $$
declare
  v_alert boolean;
  v_drop  numeric;
  v_prev  bigint;
  v_cur   bigint;
begin
  select is_alert, drop_pct, previous_rows, exact_rows
    into v_alert, v_drop, v_prev, v_cur
    from public.admin_table_row_snapshots(20)
   where table_name = 'contacts';

  if v_prev is distinct from v_cur + 1000 then
    raise exception 'T3 contacts previous_rows esperado %, veio %', v_cur + 1000, v_prev;
  end if;
  if v_drop is distinct from round(1000::numeric * 100 / v_prev, 2) then
    raise exception 'T3 contacts drop_pct esperado %, veio %',
      round(1000::numeric * 100 / v_prev, 2), v_drop;
  end if;
  if v_alert is not true then
    raise exception 'T3 contacts deveria alarmar (queda acima de 20 por cento)';
  end if;
  raise notice 'PASS [T3 contacts alarma] drop_pct=% is_alert=%', v_drop, v_alert;

  select is_alert into v_alert
    from public.admin_table_row_snapshots(20)
   where table_name = 'profiles';
  if v_alert is not false then
    raise exception 'T3 profiles NAO deveria alarmar (estavel)';
  end if;
  raise notice 'PASS [T3 profiles nao alarma]';
end $$;

-- limiar invalido
select pg_temp.espera_erro('T3 limiar invalido (150) recusado',
  'select * from public.admin_table_row_snapshots(150)', '22023');

reset role;

rollback;
