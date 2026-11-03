CREATE OR REPLACE FUNCTION public.talkx_analytics_scope(p_audience_source text DEFAULT NULL::text, p_department_id uuid DEFAULT NULL::uuid, p_channel text DEFAULT NULL::text)
 RETURNS TABLE(campaign_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id
  FROM public.talkx_campaigns AS c
  LEFT JOIN public.profiles AS p ON p.id = c.created_by
  WHERE (p_channel IS NULL OR p_channel = 'whatsapp')
    AND (p_audience_source IS NULL OR c.audience_source = p_audience_source)
    AND (p_department_id IS NULL OR p.department_id = p_department_id)
$function$
