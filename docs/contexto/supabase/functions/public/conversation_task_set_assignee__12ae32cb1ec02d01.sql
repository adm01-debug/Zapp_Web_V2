CREATE OR REPLACE FUNCTION public.conversation_task_set_assignee()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.assigned_to := NEW.created_by; RETURN NEW; END; $function$
