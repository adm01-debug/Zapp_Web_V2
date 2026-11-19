BEGIN

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$


GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated

REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM anon

ALTER TABLE public.conversation_tasks
  ADD COLUMN IF NOT EXISTS remind_at           timestamptz,
  ADD COLUMN IF NOT EXISTS notified_at         timestamptz,
  ADD COLUMN IF NOT EXISTS waiting_reason      text,
  ADD COLUMN IF NOT EXISTS position            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at          timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_at   timestamptz NOT NULL DEFAULT now()

ALTER TABLE public.conversation_tasks REPLICA IDENTITY FULL

UPDATE public.conversation_tasks
SET status = CASE
  WHEN status = 'completed' THEN 'done'
  WHEN status = 'pending'   THEN 'todo'
  ELSE COALESCE(NULLIF(status,''), 'todo')
END
WHERE status IN ('pending', 'completed')

UPDATE public.conversation_tasks
SET created_by = assigned_to
WHERE created_by IS NULL AND assigned_to IS NOT NULL

UPDATE public.conversation_tasks
SET created_by = 'd7825f6e-0240-4500-bc88-2721897f78c6'
WHERE created_by IS NULL

ALTER TABLE public.conversation_tasks ALTER COLUMN created_by SET NOT NULL

ALTER TABLE public.conversation_tasks DROP CONSTRAINT IF EXISTS conversation_tasks_status_check

ALTER TABLE public.conversation_tasks
  ADD CONSTRAINT conversation_tasks_status_check
  CHECK (status IN ('backlog','todo','doing','waiting','done','cancelled'))

ALTER TABLE public.conversation_tasks
  ADD CONSTRAINT conversation_tasks_waiting_reason_check
  CHECK (status <> 'waiting' OR waiting_reason IS NOT NULL)

ALTER TABLE public.conversation_tasks ALTER COLUMN status SET DEFAULT 'backlog'

CREATE INDEX IF NOT EXISTS idx_tasks_owner_status_due
  ON public.conversation_tasks (created_by, status, due_date)

CREATE INDEX IF NOT EXISTS idx_tasks_owner_remind_pending
  ON public.conversation_tasks (created_by, remind_at)
  WHERE remind_at IS NOT NULL
    AND notified_at IS NULL
    AND status NOT IN ('done','cancelled')

CREATE OR REPLACE FUNCTION public.conversation_task_state_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- status mudou
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
    -- entrou em doing pela primeira vez
    IF NEW.status = 'doing' AND OLD.started_at IS NULL THEN
      NEW.started_at := now();
    END IF;
    -- concluída ou cancelada: gravar completed_at e limpar alarme
    IF NEW.status IN ('done', 'cancelled') THEN
      NEW.completed_at := COALESCE(OLD.completed_at, now());
      NEW.remind_at    := NULL;
      NEW.notified_at  := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$


DROP TRIGGER IF EXISTS trg_task_state_change ON public.conversation_tasks

CREATE TRIGGER trg_task_state_change
  BEFORE UPDATE ON public.conversation_tasks
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.conversation_task_state_trigger()

CREATE OR REPLACE FUNCTION public.conversation_task_set_assignee()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.assigned_to := NEW.created_by;
  RETURN NEW;
END;
$$


DROP TRIGGER IF EXISTS trg_task_set_assignee ON public.conversation_tasks

CREATE TRIGGER trg_task_set_assignee
  BEFORE INSERT ON public.conversation_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.conversation_task_set_assignee()

DROP POLICY IF EXISTS "Agents can create tasks for their contacts" ON public.conversation_tasks

DROP POLICY IF EXISTS "Agents can update own or assigned tasks"    ON public.conversation_tasks

DROP POLICY IF EXISTS "Agents or admins can view tasks"           ON public.conversation_tasks

DROP POLICY IF EXISTS "Creators or admins can delete tasks"       ON public.conversation_tasks

CREATE POLICY tasks_select_own ON public.conversation_tasks
  FOR SELECT TO authenticated
  USING (
    created_by = public.current_profile_id()
    OR public.is_admin_or_supervisor(auth.uid())
  )

CREATE POLICY tasks_insert_own ON public.conversation_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = public.current_profile_id()
  )

CREATE POLICY tasks_update_own ON public.conversation_tasks
  FOR UPDATE TO authenticated
  USING (
    created_by = public.current_profile_id()
    OR public.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    created_by = public.current_profile_id()
    OR public.is_admin_or_supervisor(auth.uid())
  )

CREATE POLICY tasks_delete_own ON public.conversation_tasks
  FOR DELETE TO authenticated
  USING (
    created_by = public.current_profile_id()
    OR public.is_admin_or_supervisor(auth.uid())
  )

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS migrated_task_id uuid REFERENCES public.conversation_tasks(id) ON DELETE SET NULL

WITH ins AS (
  INSERT INTO public.conversation_tasks
    (title, description, remind_at, notified_at, contact_id, created_by, assigned_to,
     status, priority, status_changed_at, position)
  SELECT
    r.title,
    r.description,
    r.remind_at,
    r.notified_at,
    r.contact_id,
    r.profile_id,
    r.profile_id,
    CASE WHEN r.is_dismissed THEN 'done' ELSE 'todo' END,
    'medium',
    COALESCE(r.created_at, now()),
    0
  FROM public.reminders r
  WHERE r.migrated_task_id IS NULL
  RETURNING id, title
)
UPDATE public.reminders r
SET migrated_task_id = ins.id
FROM ins
WHERE ins.title = r.title AND r.migrated_task_id IS NULL

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'conversation_tasks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_tasks';
  END IF;
END $$


COMMIT
