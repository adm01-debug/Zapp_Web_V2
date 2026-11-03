CREATE OR REPLACE FUNCTION public.mcp_exec_many(statements text[], max_rows integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare i int; n int := coalesce(array_length(statements, 1), 0); res jsonb := '[]'::jsonb; t0 timestamptz := clock_timestamp();
begin
  for i in 1 .. n loop
    res := res || jsonb_build_object('i', i, 'sql', left(statements[i], 200), 'result', public.mcp_exec(statements[i], max_rows));
  end loop;
  return jsonb_build_object('ok', true, 'count', n, 'results', res, 'ms', round(extract(epoch from clock_timestamp()-t0)*1000));
end $function$
