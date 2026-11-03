CREATE OR REPLACE FUNCTION public.calculate_level(xp_amount bigint)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN GREATEST(1, FLOOR(SQRT(GREATEST(0, xp_amount) / 50.0))::integer + 1);
END;
$function$
