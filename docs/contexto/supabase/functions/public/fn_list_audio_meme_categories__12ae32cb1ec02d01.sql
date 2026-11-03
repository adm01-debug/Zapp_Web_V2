CREATE OR REPLACE FUNCTION public.fn_list_audio_meme_categories()
 RETURNS TABLE(category text, total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT category, COUNT(*)::bigint AS total
  FROM public.audio_memes
  GROUP BY category
  ORDER BY total DESC, category ASC;
$function$
