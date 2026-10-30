-- CV-070 fix P1: adiciona created_by + RLS restrito ao próprio usuário
ALTER TABLE public.copilot_feedback
  ADD COLUMN IF NOT EXISTS created_by UUID NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id);

DROP POLICY IF EXISTS "copilot_feedback_insert" ON public.copilot_feedback;
DROP POLICY IF EXISTS "copilot_feedback_select" ON public.copilot_feedback;

CREATE POLICY "copilot_feedback_insert"
  ON public.copilot_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "copilot_feedback_select"
  ON public.copilot_feedback
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());
