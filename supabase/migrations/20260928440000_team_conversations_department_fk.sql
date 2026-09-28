-- E30: FK de department_id em team_conversations para departments
-- Garante que conversas nao referenciem departamentos inexistentes

ALTER TABLE public.team_conversations
  DROP CONSTRAINT IF EXISTS team_conversations_department_id_fkey;

ALTER TABLE public.team_conversations
  ADD CONSTRAINT team_conversations_department_id_fkey
  FOREIGN KEY (department_id)
  REFERENCES public.departments(id)
  ON DELETE SET NULL;
