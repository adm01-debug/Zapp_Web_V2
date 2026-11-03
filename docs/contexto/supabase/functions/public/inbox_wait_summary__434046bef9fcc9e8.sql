CREATE OR REPLACE FUNCTION public.inbox_wait_summary(p_queue_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(queue_id uuid, waiting_count integer, max_wait_seconds bigint, avg_open_seconds bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH conversas AS (
    SELECT c.queue_id, c.conversation_status, c.updated_at
    FROM public.contacts c
    WHERE c.deleted_at IS NULL AND c.conversation_status IN ('open','waiting')
      AND (p_queue_id IS NULL OR c.queue_id=p_queue_id)
      AND public.is_contact_visible_to_user(c.id, auth.uid())
      AND EXISTS (SELECT 1 FROM public.messages m WHERE m.contact_id=c.id)
  )
  SELECT conversas.queue_id,
    (count(*) FILTER (WHERE conversas.conversation_status='waiting'))::integer,
    (max(extract(epoch FROM (now()-conversas.updated_at))) FILTER (WHERE conversas.conversation_status='waiting'))::bigint,
    round(avg(extract(epoch FROM (now()-conversas.updated_at))))::bigint
  FROM conversas GROUP BY conversas.queue_id ORDER BY conversas.queue_id ASC NULLS LAST;
$function$
