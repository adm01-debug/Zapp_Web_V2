CREATE OR REPLACE FUNCTION public.rpc_queue_goal_metrics()
 RETURNS TABLE(queue_id uuid, queue_name text, coverage text, contacts_open bigint, waiting_contacts bigint, avg_wait_minutes numeric, assignment_rate numeric, received_contacts bigint, assigned_contacts bigint, messages_pending bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH visible AS (
    SELECT q.id, q.name FROM public.queues q WHERE q.is_active
      AND (public.is_admin_or_supervisor(auth.uid())
        OR EXISTS (SELECT 1 FROM public.queue_members qm WHERE qm.queue_id = q.id AND qm.is_active AND qm.profile_id = public.get_profile_id_for_user(auth.uid())))
  ),
  base AS (
    SELECT c.queue_id AS qid, count(*) AS all_total,
           count(*) FILTER (WHERE c.conversation_status NOT IN ('resolved','archived')) AS open_total,
           count(*) FILTER (WHERE c.conversation_status NOT IN ('resolved','archived') AND c.assigned_to IS NULL) AS waiting_total
    FROM public.contacts c WHERE c.queue_id IS NOT NULL AND c.deleted_at IS NULL GROUP BY c.queue_id
  ),
  wait_time AS (
    SELECT qp.queue_id AS qid, round(avg(CASE WHEN qp.entered_at IS NOT NULL THEN extract(epoch FROM (now()-qp.entered_at))/60.0 ELSE qp.estimated_wait_minutes::numeric END),1) AS media
    FROM public.queue_positions qp JOIN public.contacts c ON c.id=qp.contact_id
    WHERE c.queue_id=qp.queue_id AND c.deleted_at IS NULL AND c.conversation_status NOT IN ('resolved','archived') AND c.assigned_to IS NULL GROUP BY qp.queue_id
  ),
  received AS (SELECT c.queue_id AS qid, count(*) AS total FROM public.contacts c WHERE c.queue_id IS NOT NULL AND c.deleted_at IS NULL AND c.created_at > now()-interval '7 days' GROUP BY c.queue_id),
  last_ev AS (SELECT DISTINCT ON (ce.contact_id) ce.contact_id, ce.event_type FROM public.conversation_events ce WHERE ce.event_type IN ('assign','unassign') AND ce.created_at > now()-interval '7 days' ORDER BY ce.contact_id, ce.created_at DESC, ce.id DESC),
  assigned AS (SELECT c.queue_id AS qid, count(*) AS total FROM public.contacts c JOIN last_ev e ON e.contact_id=c.id AND e.event_type='assign' WHERE c.queue_id IS NOT NULL AND c.deleted_at IS NULL AND c.created_at > now()-interval '7 days' GROUP BY c.queue_id),
  pending AS (SELECT c.queue_id AS qid, count(*) AS total FROM public.messages m JOIN public.contacts c ON c.id=m.contact_id WHERE c.queue_id IS NOT NULL AND c.deleted_at IS NULL AND c.conversation_status NOT IN ('resolved','archived') AND m.sender='contact' AND m.is_read=false AND coalesce(m.is_deleted,false)=false GROUP BY c.queue_id)
  SELECT v.id, v.name,
    CASE WHEN b.qid IS NULL THEN 'sem_base' WHEN wt.media IS NOT NULL AND coalesce(r.total,0)>0 THEN 'completa' ELSE 'parcial' END,
    CASE WHEN b.qid IS NULL THEN NULL ELSE b.open_total END,
    CASE WHEN b.qid IS NULL THEN NULL ELSE b.waiting_total END,
    wt.media,
    CASE WHEN coalesce(r.total,0)>0 THEN round(100.0*coalesce(a.total,0)/r.total,1) ELSE NULL END,
    CASE WHEN b.qid IS NULL THEN NULL ELSE coalesce(r.total,0) END,
    CASE WHEN b.qid IS NULL THEN NULL ELSE coalesce(a.total,0) END,
    CASE WHEN b.qid IS NULL THEN NULL ELSE coalesce(p.total,0) END
  FROM visible v
  LEFT JOIN base b ON b.qid=v.id LEFT JOIN wait_time wt ON wt.qid=v.id LEFT JOIN received r ON r.qid=v.id LEFT JOIN assigned a ON a.qid=v.id LEFT JOIN pending p ON p.qid=v.id
  ORDER BY v.name, v.id;
$function$
