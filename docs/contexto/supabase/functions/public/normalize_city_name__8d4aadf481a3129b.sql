CREATE OR REPLACE FUNCTION public.normalize_city_name(p_city text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  select nullif(
    btrim(regexp_replace(
      translate(
        lower(coalesce(p_city, '')),
        'áàâãäåāăąçćčďéèêëēěęíìîïīłñńňóòôõöøōőŕřśšşťúùûüūůűýÿźžż',
        'aaaaaaaaacccdeeeeeeeiiiiilnnnooooooooorrssstuuuuuuuyyzzz'
      ),
      '\s+', ' ', 'g'
    )),
    ''
  )
$function$
