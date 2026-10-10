-- talkx_settings_replay_idempotent
-- versão 20260930410000 reservada para hermes-talkx-v10-settings-replay-guards-26100108052236 em 2026-10-01T08:05:30-03:00 (hermes-db-migrar --nova)
--
-- R2-01 (achado da auditoria Onda 2, domínio replay/DBA): fecha a cadeia de replay do
-- talkx_settings. A migration original 20260916230000_talkx_e93_settings.sql usa
-- `CREATE POLICY IF NOT EXISTS` — sintaxe que NÃO existe no PostgreSQL (42601, "syntax
-- error at or near \"not\""). Num replay limpo, o CREATE TABLE vai a rollback (a
-- migration é atômica) e talkx_settings nunca nasce; a fix 20260930112833 então estoura
-- 42P01 no `drop policy if exists` (tabela inexistente).
--
-- Correção: migration idempotente que (re)cria tabela, RLS, grants, seed e policies de
-- forma válida e replayável. Em produção a mudança líquida é nula (tabela e policies já
-- existem com o mesmo corpo); em replay ela fecha o buraco e permite o resto da cadeia
-- avançar.
--
-- Classe: contrato (REVOKE + drop policy) -> aplicada logo após o merge e o deploy.
-- rollback: n/a — idempotente. Em produção a tabela, RLS, grants, seed e policies já
--           existem com o mesmo conteúdo (CREATE TABLE IF NOT EXISTS não recria; seed usa
--           ON CONFLICT (key) DO NOTHING), então não há estado a desfazer.

CREATE TABLE IF NOT EXISTS public.talkx_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.talkx_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.talkx_settings FROM PUBLIC;
GRANT ALL ON public.talkx_settings TO anon, authenticated, service_role;

INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('reply_window_hours',         '72',                  'Janela de atribuição de resposta (horas)'),
  ('optout_autoreply',           '"PARE para sair"',    'Mensagem automática ao receber STOP/PARE'),
  ('ai_insights',                'false',               'Habilita insights via ai-proxy (requer chave)'),
  ('daily_limit_per_connection', '500',                 'Limite diário de envios por conexão WhatsApp'),
  ('default_speed_profile',      '"balanced"',          'Perfil de velocidade: fast | balanced | slow'),
  ('business_hours',             '{"start":"08:00","end":"18:00","tz":"America/Sao_Paulo","days":[1,2,3,4,5]}', 'Horário comercial padrão')
ON CONFLICT (key) DO NOTHING;

drop policy if exists "authenticated_read_talkx_settings" on public.talkx_settings;

create policy "authenticated_read_talkx_settings"
  on public.talkx_settings
  for select
  to authenticated
  using (true);

drop policy if exists talkx_settings_admin_write on public.talkx_settings;

create policy talkx_settings_admin_write
  on public.talkx_settings
  for update
  to authenticated
  using (public.is_admin_or_supervisor(auth.uid()))
  with check (public.is_admin_or_supervisor(auth.uid()));
