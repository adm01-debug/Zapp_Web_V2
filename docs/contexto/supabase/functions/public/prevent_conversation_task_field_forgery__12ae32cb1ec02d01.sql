CREATE OR REPLACE FUNCTION public.prevent_conversation_task_field_forgery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN IF NEW.contact_id IS DISTINCT FROM OLD.contact_id AND NEW.contact_id IS NOT NULL AND NOT is_contact_visible_to_user(NEW.contact_id, auth.uid()) THEN RAISE EXCEPTION 'Sem permissao para atribuir este contato a task'; END IF; IF (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR NEW.created_by IS DISTINCT FROM OLD.created_by) AND NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'Sem permissao para alterar responsavel ou criador da task'; END IF; RETURN NEW; END; $function$
