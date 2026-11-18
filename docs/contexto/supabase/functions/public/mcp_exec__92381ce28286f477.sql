CREATE OR REPLACE FUNCTION public.mcp_exec(sql text, max_rows integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  q text := regexp_replace(sql, '[;\s]+$', '');
  lim int := greatest(coalesce(max_rows, 200), 0);
  rec record; rows jsonb := '[]'::jsonb; n int := 0; affected bigint; t0 timestamptz := clock_timestamp();
begin
  begin
    for rec in execute q loop
      n := n + 1;
      if n <= lim then rows := rows || to_jsonb(rec); end if;
    end loop;
    return jsonb_build_object('rows', rows, 'row_count', n, 'truncated', n > lim, 'ms', round(extract(epoch from clock_timestamp()-t0)*1000));
  exception
    when query_canceled or lock_not_available then raise;
    when others then null;
  end;
  execute q;
  get diagnostics affected = row_count;
  return jsonb_build_object('ok', true, 'rows_affected', affected, 'ms', round(extract(epoch from clock_timestamp()-t0)*1000));
end
$function$
