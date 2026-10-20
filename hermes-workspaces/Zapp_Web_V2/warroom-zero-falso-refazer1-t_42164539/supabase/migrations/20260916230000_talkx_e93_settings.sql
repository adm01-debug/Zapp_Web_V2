-- E93 · talkx_settings + RLS audit

CREATE TABLE IF NOT EXISTS public.talkx_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.talkx_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.talkx_settings FROM PUBLIC;
GRANT ALL ON public.talkx_settings TO service_role;

CREATE POLICY IF NOT EXISTS "authenticated_read_talkx_settings"
  ON public.talkx_settings FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('reply_window_hours',        '72',                  'Janeña de atribuição de resposta (horas)')
  ,('optout_autoreply',         '"PARE para sair"',    'Mensagem automática ao receber STOP/PARE')
  ,('ai_insights',              'false',               'Habilita insights via ai-proxy (requer chave)')
  ,('daily_limit_per_connection','500',                'Limite diário de envios por conexão WhatsApp')
  ,('default_speed_profile',    '"balanced"',          'Perfil de velocidade: fast | balanced | slow')
  ,('business_hours',           '{"start":"08:00","end":"18:00","tz":"America/Sao_Paulo","days":[1,2,3,4,5]}','Horário comercial padrão')
ON CONFLICT (key) DO NOTHING;
