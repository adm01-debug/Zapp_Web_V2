CREATE OR REPLACE FUNCTION public.auto_assign_to_queue_agent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_default_queue uuid;
BEGIN
  IF NEW.queue_id IS NULL AND NEW.assigned_to IS NULL THEN
    SELECT id INTO v_default_queue
    FROM public.queues
    WHERE is_active = true AND paused = false
    ORDER BY priority ASC, created_at ASC
    LIMIT 1;
    IF v_default_queue IS NOT NULL THEN
      NEW.queue_id := v_default_queue;
    END IF;
  END IF;

  IF NEW.queue_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
    NEW.assigned_to := public.queue_pick_agent(NEW.queue_id, NEW.id);
  END IF;

  RETURN NEW;
END;
$function$
