-- Fecha o achado de performance da auditoria E17 (20260926200000): 5 das 13
-- colunas FK novas nao tinham indice na origem, forcando seq scan em
-- delete/cascade/set-null vindo de auth.users, profiles ou vault.secrets.
-- Aditivo puro, tabelas pequenas (0-1 linha hoje) -- CREATE INDEX simples,
-- nao CONCURRENTLY (gateway do projeto envolve em transacao, ver CLAUDE.md
-- secao 1 regra 5).
CREATE INDEX idx_gmail_accounts_user_id ON public.gmail_accounts (user_id);
CREATE INDEX idx_message_templates_user_id ON public.message_templates (user_id);
CREATE INDEX idx_query_telemetry_user_id ON public.query_telemetry (user_id);
CREATE INDEX idx_webauthn_challenges_user_id ON public.webauthn_challenges (user_id);
CREATE INDEX idx_whatsapp_connections_instance_token_secret_id ON public.whatsapp_connections (instance_token_secret_id);
