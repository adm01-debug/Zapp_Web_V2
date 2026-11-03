CREATE OR REPLACE FUNCTION public.fn_list_audio_memes_for_user(p_category text DEFAULT NULL::text, p_only_favs boolean DEFAULT false, p_search text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, audio_url text, category text, duration_seconds numeric, use_count integer, is_favorite boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    m.id,
    m.name,
    m.audio_url,
    m.category,
    m.duration_seconds,
    m.use_count,
    (f.id IS NOT NULL) AS is_favorite,
    m.created_at
  FROM public.audio_memes m
  LEFT JOIN public.audio_meme_favorites f
    ON f.meme_id = m.id AND f.user_id = auth.uid()
  WHERE auth.uid() IS NOT NULL
    AND (p_category IS NULL OR m.category = p_category)
    AND (NOT p_only_favs OR f.id IS NOT NULL)
    AND (
      p_search IS NULL
      OR p_search = ''
      OR m.name ILIKE '%' || p_search || '%'
      OR m.category ILIKE '%' || p_search || '%'
    )
  ORDER BY (f.id IS NOT NULL) DESC, m.use_count DESC, m.name ASC
  LIMIT 1000;
$function$
