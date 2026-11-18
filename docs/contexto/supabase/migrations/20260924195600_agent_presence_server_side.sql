CREATE TABLE IF NOT EXISTS public.agent_presence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'away', 'offline')),
  updated_at timestamptz NOT NULL DEFAULT now()
)

ALTER TABLE public.agent_presence ENABLE ROW LEVEL SECURITY

CREATE POLICY "Authenticated can read all presence"
  ON public.agent_presence FOR SELECT
  TO authenticated
  USING (true)

CREATE POLICY "Users can insert own presence"
  ON public.agent_presence FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())

CREATE POLICY "Users can update own presence"
  ON public.agent_presence FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_presence
