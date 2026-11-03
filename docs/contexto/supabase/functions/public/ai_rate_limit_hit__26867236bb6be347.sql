CREATE OR REPLACE FUNCTION public.ai_rate_limit_hit(p_key text, p_window_start timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  insert into public.edge_rate_limits as e (key, window_start, hits, updated_at)
  values (p_key, p_window_start, 1, now())
  on conflict (key) do update
    set hits = case when e.window_start = excluded.window_start then e.hits + 1 else 1 end,
        window_start = excluded.window_start,
        updated_at = now()
  returning e.hits;
$function$
