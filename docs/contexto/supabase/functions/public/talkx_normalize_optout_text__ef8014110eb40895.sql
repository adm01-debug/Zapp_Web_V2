CREATE OR REPLACE FUNCTION public.talkx_normalize_optout_text(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT btrim(
    regexp_replace(
      translate(
        lower(coalesce(p_text, '')),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
        'aaaaaaeeeeiiiiooooouuuucnyaaaaaaeeeeiiiiooooouuuucny'
      ),
      '[^a-z0-9]+', ' ', 'g'
    )
  )
$function$
