CREATE OR REPLACE FUNCTION public.phone_variants(p_phone text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clean text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_variants text[];
  v_ddd text;
  v_rest text;
BEGIN
  v_variants := ARRAY[v_clean, '+' || v_clean, p_phone];
  IF v_clean LIKE '55%' AND length(v_clean) >= 12 THEN
    v_ddd := substr(v_clean, 3, 2);
    v_rest := substr(v_clean, 5);
    IF length(v_clean) = 13 AND v_rest LIKE '9%' THEN
      v_variants := v_variants || ('55' || v_ddd || substr(v_rest, 2));
    END IF;
    IF length(v_clean) = 12 THEN
      v_variants := v_variants || ('55' || v_ddd || '9' || v_rest);
    END IF;
  END IF;
  RETURN v_variants;
END;
$function$
