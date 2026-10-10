
CREATE TABLE public.voice_command_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  transcript TEXT NOT NULL,
  action TEXT NOT NULL,
  response TEXT,
  data JSONB DEFAULT '{}',
  duration_ms INTEGER,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.voice_command_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own voice logs"
  ON public.voice_command_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own voice logs"
  ON public.voice_command_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_voice_command_logs_user_id ON public.voice_command_logs(user_id);
CREATE INDEX idx_voice_command_logs_created_at ON public.voice_command_logs(created_at DESC);
