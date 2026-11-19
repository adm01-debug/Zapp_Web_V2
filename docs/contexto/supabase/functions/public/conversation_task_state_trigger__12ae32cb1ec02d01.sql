CREATE OR REPLACE FUNCTION public.conversation_task_state_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN IF NEW.status IS DISTINCT FROM OLD.status THEN NEW.status_changed_at := now(); IF NEW.status = 'doing' AND OLD.started_at IS NULL THEN NEW.started_at := now(); END IF; IF NEW.status IN ('done', 'cancelled') THEN NEW.completed_at := COALESCE(OLD.completed_at, now()); NEW.remind_at := NULL; NEW.notified_at := NULL; END IF; END IF; RETURN NEW; END; $function$
