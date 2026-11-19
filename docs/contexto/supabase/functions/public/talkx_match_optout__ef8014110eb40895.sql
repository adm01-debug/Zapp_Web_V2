CREATE OR REPLACE FUNCTION public.talkx_match_optout(p_text text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_norm text;
  v_match text;
BEGIN
  v_norm := public.talkx_normalize_optout_text(p_text);
  IF v_norm = '' THEN
    RETURN NULL;
  END IF;

  SELECT k.keyword
    INTO v_match
    FROM public.talkx_optout_keywords AS k
   WHERE k.active IS TRUE
     AND (
       (k.match_mode = 'exact'
        AND v_norm = public.talkx_normalize_optout_text(k.keyword))
       OR
       (k.match_mode = 'contains'
        AND (
          v_norm = public.talkx_normalize_optout_text(k.keyword)
          OR v_norm LIKE public.talkx_normalize_optout_text(k.keyword) || ' %'
          OR v_norm LIKE '% ' || public.talkx_normalize_optout_text(k.keyword)
          OR v_norm LIKE '% ' || public.talkx_normalize_optout_text(k.keyword) || ' %'
        ))
     )
   ORDER BY (k.match_mode = 'exact') DESC, length(k.keyword) DESC, k.keyword ASC
   LIMIT 1;

  RETURN v_match;
END;
$function$
