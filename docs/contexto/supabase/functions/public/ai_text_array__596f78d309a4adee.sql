CREATE OR REPLACE FUNCTION public.ai_text_array(p_value jsonb)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    array_agg(x order by ord),
    '{}'::text[]
  )
  from (
    select value as x, ordinality as ord
    from jsonb_array_elements_text(
      case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end
    ) with ordinality
  ) s;
$function$
