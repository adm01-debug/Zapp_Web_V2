CREATE OR REPLACE FUNCTION public.guard_multiplix_event_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_any_unlink boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'multiplix_event_delete_denied' USING ERRCODE = '55000';
  END IF;

  -- TG_OP = 'UPDATE'
  v_any_unlink :=
       (OLD.dispatch_id  IS NOT NULL AND NEW.dispatch_id  IS NULL)
    OR (OLD.recipient_id IS NOT NULL AND NEW.recipient_id IS NULL)
    OR (OLD.item_id      IS NOT NULL AND NEW.item_id      IS NULL);

  IF v_any_unlink
     AND (NEW.id             IS NOT DISTINCT FROM OLD.id)
     AND (NEW.kind           IS NOT DISTINCT FROM OLD.kind)
     AND (NEW.payload        IS NOT DISTINCT FROM OLD.payload)
     AND (NEW.correlation_id IS NOT DISTINCT FROM OLD.correlation_id)
     AND (NEW.created_at     IS NOT DISTINCT FROM OLD.created_at)
     AND ((NEW.dispatch_id  IS NOT DISTINCT FROM OLD.dispatch_id)
          OR (OLD.dispatch_id  IS NOT NULL AND NEW.dispatch_id  IS NULL))
     AND ((NEW.recipient_id IS NOT DISTINCT FROM OLD.recipient_id)
          OR (OLD.recipient_id IS NOT NULL AND NEW.recipient_id IS NULL))
     AND ((NEW.item_id      IS NOT DISTINCT FROM OLD.item_id)
          OR (OLD.item_id      IS NOT NULL AND NEW.item_id      IS NULL))
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'multiplix_event_immutable' USING ERRCODE = '55000';
END;
$function$
