CREATE OR REPLACE FUNCTION public.ai_is_canonical_churn_risk(p_value text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select p_value is null or p_value in ('low', 'medium', 'high');
$function$
