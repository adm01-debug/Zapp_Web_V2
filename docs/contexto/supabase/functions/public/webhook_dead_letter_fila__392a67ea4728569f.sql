CREATE OR REPLACE FUNCTION public.webhook_dead_letter_fila(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, external_id text, endpoint text, event_type text, retry_count integer, error_at timestamp with time zone, tem_payload boolean, total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT f.id,
         f.external_id,
         f.endpoint,
         f.event_type,
         f.retry_count,
         f.error_at,
         (f.replay_payload IS NOT NULL) AS tem_payload,
         count(*) OVER () AS total
  FROM public.webhook_failures f
  WHERE f.resolved = false
    AND public.is_admin_or_supervisor(auth.uid())
  ORDER BY f.error_at ASC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
$function$
