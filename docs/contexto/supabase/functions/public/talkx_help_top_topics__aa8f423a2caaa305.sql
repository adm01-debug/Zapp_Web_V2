CREATE OR REPLACE FUNCTION public.talkx_help_top_topics(p_days integer DEFAULT 30)
 RETURNS TABLE(article_id text, views bigint, unique_viewers bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT v.article_id, count(*) AS views, count(DISTINCT v.user_id) AS unique_viewers
  FROM public.talkx_help_views v
  WHERE auth.uid() IS NOT NULL
    AND v.viewed_at >= now() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1))
  GROUP BY v.article_id
  ORDER BY views DESC, unique_viewers DESC, v.article_id
  LIMIT 50
$function$
