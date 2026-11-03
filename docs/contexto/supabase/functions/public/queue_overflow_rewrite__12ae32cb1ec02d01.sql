CREATE OR REPLACE FUNCTION public.queue_overflow_rewrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_q record;
BEGIN
  IF NEW.queue_id IS NULL OR NEW.assigned_to IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, is_active, paused, overflow_queue_id INTO v_q
  FROM public.queues
  WHERE id = NEW.queue_id;

  IF NOT FOUND
     OR v_q.is_active IS DISTINCT FROM true
     OR v_q.paused IS TRUE
     OR v_q.overflow_queue_id IS NULL
     OR v_q.overflow_queue_id = NEW.queue_id THEN
    RETURN NULL;
  END IF;

  -- So transborda se realmente nao ha atendente elegivel na fila de origem
  IF public.queue_pick_agent(NEW.queue_id, NEW.id) IS NOT NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.contacts
     SET queue_id = v_q.overflow_queue_id
   WHERE id = NEW.id
     AND queue_id = NEW.queue_id;

  RETURN NULL;
END;
$function$
