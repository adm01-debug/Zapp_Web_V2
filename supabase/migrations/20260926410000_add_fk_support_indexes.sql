-- As 13 FKs do E17 (20260926200000) nao vieram com indice de apoio em 5 colunas.
-- Sem indice, o proprio check de FK (INSERT/UPDATE no filho, DELETE no pai) faz
-- seq scan no filho. Tabelas hoje tem 0-1 linhas (confirmado ao vivo em
-- pg_stat_user_tables) -- sem risco de lock longo, CREATE INDEX simples basta.
CREATE INDEX idx_gmail_accounts_user_id ON public.gmail_accounts (user_id);
CREATE INDEX idx_message_templates_user_id ON public.message_templates (user_id);
CREATE INDEX idx_query_telemetry_user_id ON public.query_telemetry (user_id);
CREATE INDEX idx_webauthn_challenges_user_id ON public.webauthn_challenges (user_id);
CREATE INDEX idx_whatsapp_connections_instance_token_secret_id ON public.whatsapp_connections (instance_token_secret_id);
