CREATE TABLE IF NOT EXISTS public.talkx_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
)

ALTER TABLE public.talkx_settings ENABLE ROW LEVEL SECURITY

REVOKE ALL ON public.talkx_settings FROM PUBLIC

GRANT ALL ON public.talkx_settings TO anon, authenticated, service_role

INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('reply_window_hours',         '72',                  'Janela de atribuição de resposta (horas)'),
  ('optout_autoreply',           '"PARE para sair"',    'Mensagem automática ao receber STOP/PARE'),
  ('ai_insights',                'false',               'Habilita insights via ai-proxy (requer chave)'),
  ('daily_limit_per_connection', '500',                 'Limite diário de envios por conexão WhatsApp'),
  ('default_speed_profile',      '"balanced"',          'Perfil de velocidade: fast | balanced | slow'),
  ('business_hours',             '{"start":"08:00","end":"18:00","tz":"America/Sao_Paulo","days":[1,2,3,4,5]}', 'Horário comercial padrão')
ON CONFLICT (key) DO NOTHING

drop policy if exists "authenticated_read_talkx_settings" on public.talkx_settings

create policy "authenticated_read_talkx_settings"
  on public.talkx_settings
  for select
  to authenticated
  using (true)

drop policy if exists talkx_settings_admin_write on public.talkx_settings

create policy talkx_settings_admin_write
  on public.talkx_settings
  for update
  to authenticated
  using (public.is_admin_or_supervisor(auth.uid()))
  with check (public.is_admin_or_supervisor(auth.uid()))
