-- Migration: mcp_exec_functions_harden
-- Aplicada diretamente via MCP em 2026-08-29 02:00 UTC.
-- Conteudo recuperado via pg_get_functiondef(oid).
--
-- CONTEXTO: Atualiza corpo de mcp_exec e mcp_exec_many com hardenings:
--   1. SET search_path TO 'pg_catalog', 'public' — previne search_path injection
--   2. regexp_replace para strip de semicolons/whitespace no final do SQL
--   3. Excecao query_canceled/lock_not_available re-raised (nao swallowed)
-- Relacionado: 20260829010000, 20260829010100

CREATE OR REPLACE FUNCTION public.mcp_exec(sql text, max_rows integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  q text := regexp_replace(sql, '[;\s]+$', '');
  lim int := greatest(coalesce(max_rows, 200), 0);
  rec record; rows jsonb := '[]'::jsonb; n int := 0; affected bigint;
  t0 timestamptz := clock_timestamp();
begin
  begin
    for rec in execute q loop
      n := n + 1;
      if n <= lim then rows := rows || to_jsonb(rec); end if;
    end loop;
    return jsonb_build_object('rows', rows, 'row_count', n,
      'truncated', n > lim,
      'ms', round(extract(epoch from clock_timestamp()-t0)*1000));
  exception
    when query_canceled or lock_not_available then raise;
    when others then null;
  end;
  execute q;
  get diagnostics affected = row_count;
  return jsonb_build_object('ok', true, 'rows_affected', affected,
    'ms', round(extract(epoch from clock_timestamp()-t0)*1000));
end
$function$;

CREATE OR REPLACE FUNCTION public.mcp_exec_many(statements text[], max_rows integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  i int; n int := coalesce(array_length(statements, 1), 0);
  res jsonb := '[]'::jsonb;
  t0 timestamptz := clock_timestamp();
begin
  for i in 1 .. n loop
    res := res || jsonb_build_object(
      'i', i,
      'sql', left(statements[i], 200),
      'result', public.mcp_exec(statements[i], max_rows)
    );
  end loop;
  return jsonb_build_object('ok', true, 'count', n, 'results', res,
    'ms', round(extract(epoch from clock_timestamp()-t0)*1000));
end
$function$;
