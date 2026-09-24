DROP POLICY IF EXISTS "Agents can update own or assigned tasks" ON public.conversation_tasks;

CREATE POLICY "Agents can update own or assigned tasks" ON public.conversation_tasks
  FOR UPDATE TO authenticated
  USING (
    assigned_to = get_profile_id_for_user(auth.uid())
    OR created_by = get_profile_id_for_user(auth.uid())
    OR is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    assigned_to = get_profile_id_for_user(auth.uid())
    OR created_by = get_profile_id_for_user(auth.uid())
    OR is_admin_or_supervisor(auth.uid())
  );

DROP TRIGGER IF EXISTS trg_prevent_conversation_task_contact_redirect ON public.conversation_tasks;
DROP FUNCTION IF EXISTS public.prevent_conversation_task_contact_redirect();

CREATE OR REPLACE FUNCTION public.prevent_conversation_task_field_forgery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.contact_id IS DISTINCT FROM OLD.contact_id
     AND NEW.contact_id IS NOT NULL
     AND NOT is_contact_visible_to_user(NEW.contact_id, auth.uid())
  THEN
    RAISE EXCEPTION 'Sem permissao para atribuir este contato a task';
  END IF;

  IF (
    NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  )
  AND NOT is_admin_or_supervisor(auth.uid())
  THEN
    RAISE EXCEPTION 'Sem permissao para alterar responsavel ou criador da task';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_conversation_task_field_forgery ON public.conversation_tasks;

CREATE TRIGGER trg_prevent_conversation_task_field_forgery
  BEFORE UPDATE ON public.conversation_tasks
  FOR EACH ROW
  WHEN (
    NEW.contact_id IS DISTINCT FROM OLD.contact_id
    OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  )
  EXECUTE FUNCTION public.prevent_conversation_task_field_forgery();
