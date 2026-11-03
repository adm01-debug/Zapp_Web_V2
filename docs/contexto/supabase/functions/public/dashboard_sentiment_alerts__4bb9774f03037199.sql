CREATE OR REPLACE FUNCTION public.dashboard_sentiment_alerts(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, entity_id uuid, created_at timestamp with time zone, details jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT a.id, a.entity_id, a.created_at, a.details
  FROM public.audit_logs a
  WHERE public.is_admin_or_supervisor(auth.uid())
    AND a.action = 'sentiment_alert'
    AND (p_since IS NULL OR a.created_at >= p_since)
  ORDER BY a.created_at DESC;
$function$
