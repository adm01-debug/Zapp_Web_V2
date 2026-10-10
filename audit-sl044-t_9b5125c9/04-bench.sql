-- Mede a chamada da funcao VIGENTE (aplicada de 02-canonical-20260930450000.sql)
-- e isola a causa: a janela COUNT(*) OVER () versus a MESMA consulta sem ela.
-- Entra com -v caller=<admin|agent> -v runs=<n>.
\set ON_ERROR_STOP on
\timing off

-- psql nao substitui variavel dentro de string dollar-quoted: passa por tabela.
create temp table cfg as select :runs::int as n_runs;
\echo '==== A) search_contacts REAL, 1a pagina (page_size=50, offset=0, name/asc) ===='
do $bench$
declare
  t0 timestamptz;
  i int;
  runs int;
  tc bigint;
begin
  select n_runs into runs from cfg;
  for i in 1..runs loop
    t0 := clock_timestamp();
    perform count(*) from public.search_contacts('', null, null, null, null, null, 'name', 'asc', 50, 0, false);
    raise notice 'run %: % ms', i, round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
  end loop;
  select max(total_count) into tc from public.search_contacts('', null, null, null, null, null, 'name', 'asc', 50, 0, false);
  raise notice 'total_count devolvido pela funcao = %', tc;
end
$bench$;

\echo ''
\echo '==== B) contacts_count_by_type REAL (contagem exata, KPI do Dashboard) ===='
do $bench$
declare
  t0 timestamptz; i int; runs int; r record;
begin
  select n_runs into runs from cfg;
  for i in 1..runs loop
    t0 := clock_timestamp();
    perform count(*) from public.contacts_count_by_type(false);
    raise notice 'run %: % ms', i, round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
  end loop;
  for r in select * from public.contacts_count_by_type(false) loop
    raise notice 'tipo=% count=%', r.contact_type, r.count;
  end loop;
end
$bench$;

\echo ''
\echo '==== C) ISOLAMENTO: EXPLAIN ANALYZE da MESMA leitura COM e SEM COUNT(*) OVER () ===='

\echo '--- C1) SEM a janela (so a pagina) ---'
explain (analyze, buffers, timing off, summary on)
select c.id, c.name
from public.contacts c
where c.deleted_at is null
  and (c.is_lid_legacy = false and c.phone ~ '^[0-9]{10,15}$')
order by c.name asc nulls last, c.id asc
limit 50;

\echo '--- C2) COM COUNT(*) OVER () (o que a funcao vigente faz) ---'
explain (analyze, buffers, timing off, summary on)
select c.id, c.name, count(*) over () as total_count
from public.contacts c
where c.deleted_at is null
  and (c.is_lid_legacy = false and c.phone ~ '^[0-9]{10,15}$')
order by c.name asc nulls last, c.id asc
limit 50;

\echo '--- C3) so a contagem exata, sem pagina ---'
explain (analyze, buffers, timing off, summary on)
select count(*)
from public.contacts c
where c.deleted_at is null
  and (c.is_lid_legacy = false and c.phone ~ '^[0-9]{10,15}$');
