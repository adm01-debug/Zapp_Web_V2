CREATE OR REPLACE FUNCTION public.ai_is_canonical_urgency(p_value text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select p_value is null or p_value in ('baixa', 'media', 'alta', 'critica');
$function$
