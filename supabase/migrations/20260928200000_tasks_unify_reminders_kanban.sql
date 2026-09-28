-- Fusão Tarefas + Lembretes + Kanban pessoal — Fase 1 do plano
-- docs/design/PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md (seção 3.1 / Apêndice A).
-- Aditiva e idempotente. Inventário em produção em 28/09/2026: conversation_tasks=0 linhas,
-- reminders=1 (não dispensado), sales_deals=0, órfãs=0. Decisões G-1 (migrar), G-4 (órfãs → Admin 01).

-- 1) colunas novas
ALTER TABLE public.conversation_tasks
  ADD COLUMN IF NOT EXISTS remind_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS waiting_reason text,
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now();

-- 2) backfill de status (pending→todo, completed→done) e de dono
UPDATE public.conversation_tasks SET status = 'done' WHERE status = 'completed';
UPDATE public.conversation_tasks SET status = 'todo'
 WHERE status IS NULL OR status NOT IN ('backlog','todo','doing','waiting','done','cancelled');
UPDATE public.conversation_tasks SET created_by = assigned_to WHERE created_by IS NULL AND assigned_to IS NOT NULL;
-- G-4: órfãs (0 em produção) → perfil "Admin 01"
UPDATE public.conversation_tasks SET created_by = 'd7825f6e-0240-4500-bc88-2721897f78c6' WHERE created_by IS NULL;
UPDATE public.conversation_tasks SET assigned_to = created_by WHERE assigned_to IS DISTINCT FROM created_by;

-- 3) dono obrigatório; tarefa pessoal morre com o perfil (mesmo padrão de reminders.profile_id)
ALTER TABLE public.conversation_tasks DROP CONSTRAINT IF EXISTS conversation_tasks_created_by_fkey;
ALTER TABLE public.conversation_tasks
  ADD CONSTRAINT conversation_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.conversation_tasks ALTER COLUMN created_by SET NOT NULL;

-- 4) constraints de domínio
ALTER TABLE public.conversation_tasks DROP CONSTRAINT IF EXISTS conversation_tasks_status_check;
ALTER TABLE public.conversation_tasks ADD CONSTRAINT conversation_tasks_status_check
  CHECK (status IN ('backlog','todo','doing','waiting','done','cancelled'));
ALTER TABLE public.conversation_tasks DROP CONSTRAINT IF EXISTS conversation_tasks_priority_check;
ALTER TABLE public.conversation_tasks ADD CONSTRAINT conversation_tasks_priority_check
  CHECK (priority IN ('low','medium','high','urgent'));
ALTER TABLE public.conversation_tasks DROP CONSTRAINT IF EXISTS conversation_tasks_waiting_reason_check;
ALTER TABLE public.conversation_tasks ADD CONSTRAINT conversation_tasks_waiting_reason_check
  CHECK (status <> 'waiting' OR (waiting_reason IS NOT NULL AND btrim(waiting_reason) <> ''));
ALTER TABLE public.conversation_tasks ALTER COLUMN status SET DEFAULT 'backlog';

-- 5) índices
CREATE INDEX IF NOT EXISTS idx_tasks_owner_status_due ON public.conversation_tasks (created_by, status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_remind_pending ON public.conversation_tasks (created_by, remind_at)
  WHERE remind_at IS NOT NULL AND notified_at IS NULL AND status NOT IN ('done','cancelled');
CREATE INDEX IF NOT EXISTS idx_tasks_remind_due_pending ON public.conversation_tasks (remind_at)
  WHERE remind_at IS NOT NULL AND notified_at IS NULL AND status NOT IN ('done','cancelled');

-- 6) trigger de ciclo de vida (espelhado em src/hooks/tasks/workItemMachine.ts)
CREATE OR REPLACE FUNCTION public.conversation_tasks_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.assigned_to := NEW.created_by;
    NEW.status_changed_at := COALESCE(NEW.status_changed_at, now());
    IF NEW.status = 'doing' THEN NEW.started_at := COALESCE(NEW.started_at, now()); END IF;
    IF NEW.status = 'done' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
      NEW.remind_at := NULL;
    ELSIF NEW.status = 'cancelled' THEN
      NEW.remind_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
    IF NEW.status = 'doing' THEN NEW.started_at := COALESCE(NEW.started_at, now()); END IF;
    IF NEW.status = 'done' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
      NEW.remind_at := NULL;
    ELSIF NEW.status = 'cancelled' THEN
      NEW.remind_at := NULL;
    ELSE
      NEW.completed_at := NULL;
    END IF;
    IF NEW.status <> 'waiting' THEN NEW.waiting_reason := NULL; END IF;
  END IF;

  -- alarme alterado (adiar) → volta a ser elegível para aviso
  IF NEW.remind_at IS DISTINCT FROM OLD.remind_at THEN NEW.notified_at := NULL; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_conversation_tasks_lifecycle ON public.conversation_tasks;
CREATE TRIGGER trg_conversation_tasks_lifecycle
  BEFORE INSERT OR UPDATE ON public.conversation_tasks
  FOR EACH ROW EXECUTE FUNCTION public.conversation_tasks_lifecycle();

-- 7) RLS: tarefa é só do dono (mesmo padrão de reminders; sem bypass de admin)
DROP POLICY IF EXISTS "Agents can create tasks for their contacts" ON public.conversation_tasks;
DROP POLICY IF EXISTS "Agents can update own or assigned tasks" ON public.conversation_tasks;
DROP POLICY IF EXISTS "Agents or admins can view tasks" ON public.conversation_tasks;
DROP POLICY IF EXISTS "Creators or admins can delete tasks" ON public.conversation_tasks;
DROP POLICY IF EXISTS "Authenticated can view tasks" ON public.conversation_tasks;
DROP POLICY IF EXISTS "Authenticated can create tasks" ON public.conversation_tasks;
DROP POLICY IF EXISTS "Authenticated can update tasks" ON public.conversation_tasks;
DROP POLICY IF EXISTS "Authenticated can delete tasks" ON public.conversation_tasks;
DROP POLICY IF EXISTS tasks_select_own ON public.conversation_tasks;
DROP POLICY IF EXISTS tasks_insert_own ON public.conversation_tasks;
DROP POLICY IF EXISTS tasks_update_own ON public.conversation_tasks;
DROP POLICY IF EXISTS tasks_delete_own ON public.conversation_tasks;
CREATE POLICY tasks_select_own ON public.conversation_tasks FOR SELECT TO authenticated
  USING (created_by = public.get_profile_id_for_user(auth.uid()));
CREATE POLICY tasks_insert_own ON public.conversation_tasks FOR INSERT TO authenticated
  WITH CHECK (created_by = public.get_profile_id_for_user(auth.uid()));
CREATE POLICY tasks_update_own ON public.conversation_tasks FOR UPDATE TO authenticated
  USING (created_by = public.get_profile_id_for_user(auth.uid()))
  WITH CHECK (created_by = public.get_profile_id_for_user(auth.uid()));
CREATE POLICY tasks_delete_own ON public.conversation_tasks FOR DELETE TO authenticated
  USING (created_by = public.get_profile_id_for_user(auth.uid()));
ALTER TABLE public.conversation_tasks ENABLE ROW LEVEL SECURITY;

-- 8) migração dos lembretes (G-1): cada reminder vira tarefa com alarme; rastreável e idempotente
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS migrated_task_id uuid;
WITH src AS (
  SELECT r.id AS reminder_id, gen_random_uuid() AS task_id, r.title, r.description, r.remind_at,
         r.notified_at, r.contact_id, r.profile_id, r.created_at, r.is_dismissed
  FROM public.reminders r
  WHERE r.migrated_task_id IS NULL
), ins AS (
  INSERT INTO public.conversation_tasks
    (id, title, description, status, priority, remind_at, notified_at, contact_id, created_by, assigned_to,
     created_at, completed_at, status_changed_at)
  SELECT task_id, title, description,
         CASE WHEN is_dismissed THEN 'done' ELSE 'todo' END,
         'medium',
         CASE WHEN is_dismissed THEN NULL ELSE remind_at END,
         notified_at, contact_id, profile_id, profile_id,
         created_at,
         CASE WHEN is_dismissed THEN created_at END,
         created_at
  FROM src
  RETURNING id
)
UPDATE public.reminders r SET migrated_task_id = src.task_id FROM src WHERE r.id = src.reminder_id;

-- 9) realtime (o front assina postgres_changes filtrado por created_by)
ALTER TABLE public.conversation_tasks REPLICA IDENTITY FULL;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversation_tasks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_tasks;
  END IF;
END
$do$;

-- ROLLBACK (manual):
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.conversation_tasks;
--   ALTER TABLE public.conversation_tasks REPLICA IDENTITY DEFAULT;
--   DROP TRIGGER IF EXISTS trg_conversation_tasks_lifecycle ON public.conversation_tasks;
--   DROP FUNCTION IF EXISTS public.conversation_tasks_lifecycle();
--   DROP POLICY tasks_select_own/tasks_insert_own/tasks_update_own/tasks_delete_own e recriar as 4 policies
--     de 20260909200000_harden_inbox_contact_authorization.sql;
--   ALTER TABLE public.conversation_tasks DROP CONSTRAINT conversation_tasks_status_check, DROP CONSTRAINT
--     conversation_tasks_priority_check, DROP CONSTRAINT conversation_tasks_waiting_reason_check;
--   UPDATE status done→completed, demais→pending; ALTER COLUMN status SET DEFAULT 'pending';
--   ALTER COLUMN created_by DROP NOT NULL; FK created_by de volta para ON DELETE SET NULL;
--   DROP INDEX idx_tasks_owner_status_due, idx_tasks_owner_remind_pending, idx_tasks_remind_due_pending;
--   ALTER TABLE public.conversation_tasks DROP COLUMN remind_at, notified_at, waiting_reason, position,
--     started_at, status_changed_at;
--   DELETE FROM public.conversation_tasks t USING public.reminders r WHERE r.migrated_task_id = t.id;
--   ALTER TABLE public.reminders DROP COLUMN migrated_task_id;
