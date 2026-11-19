CREATE OR REPLACE FUNCTION public.search_insights(p_days integer DEFAULT 30)
 RETURNS TABLE(total_searches bigint, searches_without_results bigint, searches_with_click bigint, average_term_length numeric, searches_by_kind jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c_days integer; c_from timestamptz;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  c_days := CASE WHEN p_days IS NULL THEN 30 WHEN p_days<1 THEN 1 WHEN p_days>365 THEN 365 ELSE p_days END;
  c_from := now()-make_interval(days=>c_days);
  RETURN QUERY SELECT count(*)::bigint, count(*) FILTER (WHERE NOT e.had_results)::bigint, count(*) FILTER (WHERE e.clicked)::bigint, round(avg(e.term_length)::numeric,1),
    coalesce((SELECT jsonb_object_agg(k.result_kind,k.total ORDER BY k.result_kind) FROM (SELECT e2.result_kind, count(*)::bigint AS total FROM public.search_events e2 WHERE e2.created_at>=c_from AND e2.result_kind IS NOT NULL GROUP BY e2.result_kind) k),'{}')
  FROM public.search_events e WHERE e.created_at>=c_from;
END;
$function$
