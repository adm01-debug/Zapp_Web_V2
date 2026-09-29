-- E30: UNIQUE index on department_id (one conv per dept) + FK ON DELETE CASCADE
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_conversations_dept_unique
  ON public.team_conversations(department_id)
  WHERE type = 'department' AND department_id IS NOT NULL;

ALTER TABLE public.team_conversations
  DROP CONSTRAINT IF EXISTS team_conversations_department_id_fkey;

ALTER TABLE public.team_conversations
  ADD CONSTRAINT team_conversations_department_id_fkey
    FOREIGN KEY (department_id) REFERENCES public.departments(id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
