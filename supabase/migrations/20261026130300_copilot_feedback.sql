-- CV-065/CV-066: tabela de feedback do copiloto (distância de edição + thumbs)
CREATE TABLE IF NOT EXISTS public.copilot_feedback (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID        NOT NULL,
  contact_id       UUID        NOT NULL,
  feedback_type    TEXT        NOT NULL CHECK (feedback_type IN ('edit_distance', 'thumbs')),
  edit_level       TEXT        CHECK (edit_level IN ('igual', 'pouco', 'muito')),
  suggestion_text  TEXT,
  sent_text        TEXT,
  suggestion_id    TEXT,
  rating           TEXT        CHECK (rating IN ('positive', 'negative')),
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copilot_feedback_insert"
  ON public.copilot_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "copilot_feedback_select"
  ON public.copilot_feedback
  FOR SELECT
  TO authenticated
  USING (true);
