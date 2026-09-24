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

CREATE OR REPLACE FUNCTION public.prevent_conversation_task_contact_redirect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL AND NOT is_contact_visible_to_user(NEW.contact_id, auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissao para atribuir este contato a task';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_conversation_task_contact_redirect ON public.conversation_tasks;

CREATE TRIGGER trg_prevent_conversation_task_contact_redirect
  BEFORE UPDATE ON public.conversation_tasks
  FOR EACH ROW
  WHEN (NEW.contact_id IS DISTINCT FROM OLD.contact_id)
  EXECUTE FUNCTION public.prevent_conversation_task_contact_redirect();
