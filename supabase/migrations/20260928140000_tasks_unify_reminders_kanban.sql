-- migration: tasks_unify_reminders_kanban
-- Fase 1 do plano PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md
-- Aplicar via db_query (MCP SUPABASE - ZAPP WEB V2) — supabase_apply_migration está bugado neste env
-- ROLLBACK manual documentado no final
BEGIN;

-- 1. Helper: alias current_profile_id() para uso nas RLS (gap D3)
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM anon;

-- 2. Colunas novas
ALTER TABLE public.conversation_tasks
  ADD COLUMN IF NOT EXISTS remind_at           timestamptz,
  ADD COLUMN IF NOT EXISTS notified_at         timestamptz,
  ADD COLUMN IF NOT EXISTS waiting_reason      text,
  ADD COLUMN IF NOT EXISTS position            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at          timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_at   timestamptz NOT NULL DEFAULT now();

-- 3. Replica identity (necessário para realtime com filtro por created_by — gap D5)
ALTER TABLE public.conversation_tasks REPLICA IDENTITY FULL;

-- 4. Backfill de status: pending→todo, completed→done
UPDATE public.conversation_tasks
SET status = CASE
  WHEN status = 'completed' THEN 'done'
  WHEN status = 'pending'   THEN 'todo'
  ELSE COALESCE(NULLIF(status,''), 'todo')
END
WHERE status IN ('pending', 'completed');

-- 5. Backfill de created_by: usar assigned_to quando nulo; órfãs → Admin 01
UPDATE public.conversation_tasks
SET created_by = assigned_to
WHERE created_by IS NULL AND assigned_to IS NOT NULL;

-- G-4: órfãs restantes → Admin 01
UPDATE public.conversation_tasks
SET created_by = 'd7825f6e-0240-4500-bc88-2721897f78c6'
WHERE created_by IS NULL;

ALTER TABLE public.conversation_tasks ALTER COLUMN created_by SET NOT NULL;

-- 6. Constraints de status (com novo enum de 6 valores)
ALTER TABLE public.conversation_tasks DROP CONSTRAINT IF EXISTS conversation_tasks_status_check;
ALTER TABLE public.conversation_tasks
  ADD CONSTRAINT conversation_tasks_status_check
  CHECK (status IN ('backlog','todo','doing','waiting','done','cancelled'));

ALTER TABLE public.conversation_tasks
  ADD CONSTRAINT conversation_tasks_waiting_reason_check
  CHECK (status <> 'waiting' OR waiting_reason IS NOT NULL);

ALTER TABLE public.conversation_tasks ALTER COLUMN status SET DEFAULT 'backlog';

-- 7. Índices de performance
CREATE INDEX IF NOT EXISTS idx_tasks_owner_status_due
  ON public.conversation_tasks (created_by, status, due_date);

CREATE INDEX IF NOT EXISTS idx_tasks_owner_remind_pending
  ON public.conversation_tasks (created_by, remind_at)
  WHERE remind_at IS NOT NULL
    AND notified_at IS NULL
    AND status NOT IN ('done','cancelled');

-- 8. Trigger: status_changed_at, started_at, completed_at, remind_at limpo
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
$$;

DROP TRIGGER IF EXISTS trg_task_state_change ON public.conversation_tasks;
CREATE TRIGGER trg_task_state_change
  BEFORE UPDATE ON public.conversation_tasks
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.conversation_task_state_trigger();

-- 9. Trigger BEFORE INSERT: assigned_to := created_by (gap D4 — INSERT, não UPDATE)
CREATE OR REPLACE FUNCTION public.conversation_task_set_assignee()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.assigned_to := NEW.created_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_set_assignee ON public.conversation_tasks;
CREATE TRIGGER trg_task_set_assignee
  BEFORE INSERT ON public.conversation_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.conversation_task_set_assignee();

-- 10. RLS: substituir as 4 policies existentes por versão "só o dono" (gap D2)
DROP POLICY IF EXISTS "Agents can create tasks for their contacts" ON public.conversation_tasks;
DROP POLICY IF EXISTS "Agents can update own or assigned tasks"    ON public.conversation_tasks;
DROP POLICY IF EXISTS "Agents or admins can view tasks"           ON public.conversation_tasks;
DROP POLICY IF EXISTS "Creators or admins can delete tasks"       ON public.conversation_tasks;

-- SELECT: dono ou admin/supervisor
CREATE POLICY tasks_select_own ON public.conversation_tasks
  FOR SELECT TO authenticated
  USING (
    created_by = public.current_profile_id()
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- INSERT: dono (created_by = próprio perfil)
CREATE POLICY tasks_insert_own ON public.conversation_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = public.current_profile_id()
  );

-- UPDATE: dono ou admin/supervisor
CREATE POLICY tasks_update_own ON public.conversation_tasks
  FOR UPDATE TO authenticated
  USING (
    created_by = public.current_profile_id()
    OR public.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    created_by = public.current_profile_id()
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- DELETE: dono ou admin/supervisor
CREATE POLICY tasks_delete_own ON public.conversation_tasks
  FOR DELETE TO authenticated
  USING (
    created_by = public.current_profile_id()
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- 11. Migração de reminders → tasks (G-1)
ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS migrated_task_id uuid REFERENCES public.conversation_tasks(id) ON DELETE SET NULL;

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
    r.profile_id,          -- created_by
    r.profile_id,          -- assigned_to
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
WHERE ins.title = r.title AND r.migrated_task_id IS NULL;

-- 12. Publicação realtime (gap D5)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'conversation_tasks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_tasks';
  END IF;
END $$;

COMMIT;

-- =============================================================
-- ROLLBACK MANUAL (executar em caso de problema):
-- BEGIN;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.conversation_tasks;
-- UPDATE public.conversation_tasks SET status = 'pending'  WHERE status IN ('todo','doing','waiting','backlog');
-- UPDATE public.conversation_tasks SET status = 'completed' WHERE status = 'done';
-- ALTER TABLE public.conversation_tasks DROP CONSTRAINT IF EXISTS conversation_tasks_status_check;
-- ALTER TABLE public.conversation_tasks DROP CONSTRAINT IF EXISTS conversation_tasks_waiting_reason_check;
-- ALTER TABLE public.conversation_tasks ADD CONSTRAINT conversation_tasks_status_check CHECK (status IN ('pending','completed'));
-- ALTER TABLE public.conversation_tasks ALTER COLUMN created_by DROP NOT NULL;
-- DROP POLICY IF EXISTS tasks_select_own ON public.conversation_tasks;
-- DROP POLICY IF EXISTS tasks_insert_own ON public.conversation_tasks;
-- DROP POLICY IF EXISTS tasks_update_own ON public.conversation_tasks;
-- DROP POLICY IF EXISTS tasks_delete_own ON public.conversation_tasks;
-- -- restaurar as 4 policies originais abaixo
-- DROP TRIGGER IF EXISTS trg_task_state_change ON public.conversation_tasks;
-- DROP TRIGGER IF EXISTS trg_task_set_assignee ON public.conversation_tasks;
-- DROP FUNCTION IF EXISTS public.conversation_task_state_trigger();
-- DROP FUNCTION IF EXISTS public.conversation_task_set_assignee();
-- DROP FUNCTION IF EXISTS public.current_profile_id();
-- ALTER TABLE public.conversation_tasks DROP COLUMN IF EXISTS remind_at, DROP COLUMN IF EXISTS notified_at,
--   DROP COLUMN IF EXISTS waiting_reason, DROP COLUMN IF EXISTS position, DROP COLUMN IF EXISTS started_at,
--   DROP COLUMN IF EXISTS status_changed_at;
-- ALTER TABLE public.conversation_tasks REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.reminders DROP COLUMN IF EXISTS migrated_task_id;
-- DELETE FROM public.conversation_tasks WHERE status_changed_at > '<ts da migration>';
-- COMMIT;
-- =============================================================
