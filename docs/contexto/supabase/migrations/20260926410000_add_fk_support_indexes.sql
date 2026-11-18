CREATE INDEX idx_gmail_accounts_user_id ON public.gmail_accounts (user_id)

CREATE INDEX idx_message_templates_user_id ON public.message_templates (user_id)

CREATE INDEX idx_query_telemetry_user_id ON public.query_telemetry (user_id)

CREATE INDEX idx_webauthn_challenges_user_id ON public.webauthn_challenges (user_id)

CREATE INDEX idx_whatsapp_connections_instance_token_secret_id ON public.whatsapp_connections (instance_token_secret_id)
