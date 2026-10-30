-- supabase/tests/get_team_birthdays.sql
-- Prova da RPC public.get_team_birthdays() (auditoria paridade V3->V2 doc 26, achado HZ3-002).
--
-- Roda no banco LOCAL da tarefa com o PAPEL REAL (authenticated, anon), nunca so como postgres.
-- Uso: zapp-db-local psql . <stack> < supabase/tests/get_team_birthdays.sql
-- Qualquer assercao que falha => RAISE EXCEPTION => psql sai != 0 por causa do ON_ERROR_STOP.
-- A fixture vive numa transacao unica e e desfeita no ROLLBACK final (nada fica no banco).
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Fixture (como postgres). 3 usuarios/perfis com nome unico (busca robusta):
--   A = ativo  com aniversario 07/03  -> deve aparecer (dia 7, mes 3)
--   B = ativo  SEM aniversario        -> nao aparece
--   C = inativo com aniversario 25/12 -> nao aparece
-- session_replication_role=replica desliga gatilhos/FK apenas no DML da fixture.
-- ---------------------------------------------------------------------------
set local session_replication_role = replica;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

insert into public.profiles (id, user_id, name, is_active, birthday) values
  ('aaaa1111-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', '__HZ3_ATIVO__',   true,  date '1990-03-07'),
  ('bbbb2222-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', '__HZ3_SEMDATA__', true,  null),
  ('cccc3333-0000-0000-0000-00000000000c', '33333333-3333-3333-3333-333333333333', '__HZ3_INATIVO__', false, date '1985-12-25');

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- BLOCO B (postgres, mesmo antes de qualquer role): o contrato exposto NAO tem
-- o ano nem a data completa -- so id, birthday_day, birthday_month.
-- ---------------------------------------------------------------------------
do $$
declare
  v_cols text;
begin
  select string_agg(n, ',' order by ord) into v_cols
  from unnest((select proargnames from pg_catalog.pg_proc
               where oid = 'public.get_team_birthdays()'::regprocedure)) with ordinality as t(n, ord);
  if v_cols is distinct from 'id,birthday_day,birthday_month' then
    raise exception 'BLOCO B FALHOU: colunas expostas = % (esperado id,birthday_day,birthday_month)', v_cols;
  end if;
  raise notice 'BLOCO B OK: colunas expostas = % (sem ano, sem data completa)', v_cols;
end $$;

-- ---------------------------------------------------------------------------
-- BLOCO D: o rollback da migration (drop da funcao nova) roda e e reversivel.
-- ---------------------------------------------------------------------------
savepoint rb;

drop function if exists public.get_team_birthdays();

do $$
begin
  if to_regprocedure('public.get_team_birthdays()') is not null then
    raise exception 'BLOCO D FALHOU: rollback (drop function) nao removeu a RPC';
  end if;
end $$;

rollback to savepoint rb;

do $$
begin
  if to_regprocedure('public.get_team_birthdays()') is null then
    raise exception 'BLOCO D FALHOU: a RPC nao voltou ao desfazer o savepoint';
  end if;
  raise notice 'BLOCO D OK: rollback (drop function) roda e o savepoint devolve a RPC';
end $$;

-- ---------------------------------------------------------------------------
-- BLOCO A (papel real authenticated, como um agente comum do Team Chat):
-- recebe dia/mes dos colegas ATIVOS; inativo e quem nao tem data ficam de fora.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
                   json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);

do $$
declare
  v_dia int;
  v_mes int;
  v_inativo int;
  v_semdata int;
begin
  select birthday_day, birthday_month into v_dia, v_mes
  from public.get_team_birthdays()
  where id = 'aaaa1111-0000-0000-0000-00000000000a';

  if v_dia is null then
    raise exception 'BLOCO A FALHOU: perfil ativo com aniversario nao apareceu';
  end if;
  if v_dia <> 7 or v_mes <> 3 then
    raise exception 'BLOCO A FALHOU: esperado dia=7 mes=3, veio dia=% mes=%', v_dia, v_mes;
  end if;

  select count(*) into v_inativo
  from public.get_team_birthdays()
  where id = 'cccc3333-0000-0000-0000-00000000000c';
  if v_inativo <> 0 then
    raise exception 'BLOCO A FALHOU: perfil INATIVO apareceu na lista de aniversarios';
  end if;

  select count(*) into v_semdata
  from public.get_team_birthdays()
  where id = 'bbbb2222-0000-0000-0000-00000000000b';
  if v_semdata <> 0 then
    raise exception 'BLOCO A FALHOU: perfil ativo SEM aniversario apareceu';
  end if;

  raise notice 'BLOCO A OK: authenticated ve 07/03 do ativo; inativo e sem-data fora';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- BLOCO C (papel real anon): EXECUTE negado -- a RPC nao existe para quem nao logou.
-- ---------------------------------------------------------------------------
set local role anon;

do $$
begin
  perform * from public.get_team_birthdays();
  raise exception 'BLOCO C FALHOU: anon NAO deveria executar get_team_birthdays';
exception
  when insufficient_privilege then
    raise notice 'BLOCO C OK: anon negado (insufficient_privilege)';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Nao suja o banco: desfaz fixture e savepoints.
-- ---------------------------------------------------------------------------
rollback;

\echo 'get_team_birthdays: SUITE COMPLETA OK (A: authenticated ativo/inativo/sem-data, B: contrato sem ano, C: anon negado, D: rollback)'
