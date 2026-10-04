-- Leitura do gateway MCP sem poder de escrita (backlog QA5-01).
--
-- Problema: public.mcp_exec roda como postgres (SECURITY DEFINER) e, quando a leitura linha a
-- linha falha, engole o erro (EXCEPTION WHEN OTHERS THEN NULL) e executa o texto bruto: DDL, DML
-- e várias instruções passam. Quem só precisa LER (sensor, zapp-db-ler) usa hoje esse mesmo caminho.
--
-- Esta migration é ADITIVA: cria o caminho de leitura ao lado do atual e não altera mcp_exec.
--   * papel mcp_ro_reader: sem login, só SELECT em public, cron e supabase_migrations
--     (nada em vault, pgsodium ou auth); BYPASSRLS para a leitura enxergar as linhas;
--   * função public.mcp_query_ro(sql, max_rows): SECURITY DEFINER cujo DONO é o mcp_ro_reader,
--     então o SQL recebido roda com os privilégios do papel de leitura, não do postgres;
--     transação marcada como somente leitura antes de executar; sem bloco de exceção, sem
--     segunda tentativa: erro volta como erro.
-- Dentro de função SECURITY DEFINER o Postgres recusa SET ROLE, então o SQL recebido não consegue
-- trocar de papel.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mcp_ro_reader') then
    create role mcp_ro_reader nologin noinherit bypassrls;
  end if;
end $$;

-- O postgres vira membro do papel: precisa disso para lhe entregar a função (ALTER ... OWNER) e
-- para continuar podendo recriá-la em migrations futuras (direito de dono herdado). O que ele
-- herda é só leitura, que já tem.
grant mcp_ro_reader to postgres with inherit true, set true;

do $$
declare s text;
begin
  foreach s in array array['public', 'cron', 'supabase_migrations'] loop
    if to_regnamespace(s) is null then continue; end if;
    begin
      execute format('grant usage on schema %I to mcp_ro_reader', s);
      execute format('grant select on all tables in schema %I to mcp_ro_reader', s);
    exception when insufficient_privilege then
      raise warning 'mcp_ro_reader: sem permissão para conceder leitura em %', s;
    end;
  end loop;
end $$;

-- tabelas criadas daqui em diante pelo postgres em public já nascem legíveis pelo papel
alter default privileges for role postgres in schema public grant select on tables to mcp_ro_reader;

create or replace function public.mcp_query_ro(sql text, max_rows integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  q text := regexp_replace(sql, '[;\s]+$', '');
  lim int := least(greatest(coalesce(max_rows, 200), 0), 1000);
  rec record; rows jsonb := '[]'::jsonb; n int := 0; t0 timestamptz := clock_timestamp();
begin
  if q is null or q !~* '^\s*(select|with|table|values)\M' then
    raise exception 'mcp_query_ro: apenas leitura (a instrução deve começar com SELECT ou WITH)'
      using errcode = 'insufficient_privilege';
  end if;
  -- vale até o fim da transação: nada do que vier depois consegue escrever
  perform set_config('transaction_read_only', 'on', true);
  for rec in execute q loop
    n := n + 1;
    exit when n > lim;
    rows := rows || to_jsonb(rec);
  end loop;
  return jsonb_build_object(
    'rows', rows,
    'row_count', least(n, lim),
    'truncated', n > lim,
    'ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
end
$function$;

comment on function public.mcp_query_ro(text, integer) is
  'Leitura do gateway MCP: roda como mcp_ro_reader, em transação somente leitura, sem fallback. Não usar mcp_exec para ler.';

-- quem pode chamar (antes de trocar o dono: depois disso o postgres não é mais o dono)
revoke all on function public.mcp_query_ro(text, integer) from public, anon, authenticated;
grant execute on function public.mcp_query_ro(text, integer) to service_role;

-- trocar o dono exige que o novo dono tenha CREATE no schema só no instante da troca
grant create on schema public to mcp_ro_reader;
alter function public.mcp_query_ro(text, integer) owner to mcp_ro_reader;
revoke create on schema public from mcp_ro_reader;
