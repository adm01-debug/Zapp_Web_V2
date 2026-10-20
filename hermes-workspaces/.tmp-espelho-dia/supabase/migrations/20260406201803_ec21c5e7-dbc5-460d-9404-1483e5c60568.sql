
-- Tabela para registrar consumo de IA por usuário
CREATE TABLE public.ai_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  profile_id UUID REFERENCES public.profiles(id),
  function_name TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para consultas frequentes
CREATE INDEX idx_ai_usage_logs_user_id ON public.ai_usage_logs(user_id);
CREATE INDEX idx_ai_usage_logs_profile_id ON public.ai_usage_logs(profile_id);
CREATE INDEX idx_ai_usage_logs_function_name ON public.ai_usage_logs(function_name);
CREATE INDEX idx_ai_usage_logs_created_at ON public.ai_usage_logs(created_at DESC);
CREATE INDEX idx_ai_usage_logs_status ON public.ai_usage_logs(status);

-- RLS
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Admins e supervisores podem ver tudo
CREATE POLICY "Admins can view all AI usage logs"
ON public.ai_usage_logs FOR SELECT
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- Inserção apenas via service_role (edge functions)
CREATE POLICY "Service role can insert AI usage logs"
ON public.ai_usage_logs FOR INSERT
TO service_role
WITH CHECK (true);

-- Agentes podem ver seus próprios logs
CREATE POLICY "Users can view own AI usage logs"
ON public.ai_usage_logs FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Publicação realtime para dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_usage_logs;
