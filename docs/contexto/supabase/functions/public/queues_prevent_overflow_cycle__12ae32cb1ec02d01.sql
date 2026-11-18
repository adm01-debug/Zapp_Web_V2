CREATE OR REPLACE FUNCTION public.queues_prevent_overflow_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_cur uuid;
  v_depth integer := 0;
BEGIN
  IF NEW.overflow_queue_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.overflow_queue_id = NEW.id THEN
    RAISE EXCEPTION 'queues.overflow_queue_id: uma fila nao pode transbordar para si mesma (queue %)', NEW.id
      USING ERRCODE = '23514';
  END IF;
  v_cur := NEW.overflow_queue_id;
  WHILE v_cur IS NOT NULL AND v_depth < 100 LOOP
    IF v_cur = NEW.id THEN
      RAISE EXCEPTION 'queues.overflow_queue_id: ciclo de transbordo detectado (queue %)', NEW.id
        USING ERRCODE = '23514';
    END IF;
    SELECT q.overflow_queue_id INTO v_cur FROM public.queues q WHERE q.id = v_cur;
    v_depth := v_depth + 1;
  END LOOP;
  RETURN NEW;
END;
$function$
