-- E17 (PLANO_MELHORIAS_50): declara FKs para colunas *_id sem constraint que
-- de fato apontam para uma tabela interna existente (verificado ao vivo em
-- 26/09: 0 órfãos em todas as 13 colunas abaixo contra o alvo real).
-- NOT VALID evita scan bloqueante na criação; VALIDATE CONSTRAINT roda em
-- seguida (SHARE UPDATE EXCLUSIVE, não bloqueia leitura/escrita) — já sabemos
-- que passa, pois a contagem de órfãos é 0.
--
-- As demais colunas *_id sem FK levantadas no inventário (ex.: external_id,
-- gmail_message_id, sicoob_*_id, whatsapp_flow_id, retailer_id, tts_voice_id)
-- são identificadores de sistemas externos (Evolution/WhatsApp, Gmail API,
-- SICOOB, CRM, catálogo externo doufsxqlfjyuvxuezpln) ou colunas polimórficas
-- (audit_logs.entity_id, entity_versions.entity_id) — não têm uma única
-- tabela local para referenciar, ficam de fora desta migration por design.

ALTER TABLE public.ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.gmail_accounts
  ADD CONSTRAINT gmail_accounts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.message_templates
  ADD CONSTRAINT message_templates_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.query_telemetry
  ADD CONSTRAINT query_telemetry_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.saved_filters
  ADD CONSTRAINT saved_filters_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.user_devices
  ADD CONSTRAINT user_devices_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.user_service_accounts
  ADD CONSTRAINT user_service_accounts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.user_sessions
  ADD CONSTRAINT user_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.voice_command_logs
  ADD CONSTRAINT voice_command_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.webauthn_challenges
  ADD CONSTRAINT webauthn_challenges_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.performance_snapshots
  ADD CONSTRAINT performance_snapshots_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.whatsapp_connections
  ADD CONSTRAINT whatsapp_connections_instance_token_secret_id_fkey
  FOREIGN KEY (instance_token_secret_id) REFERENCES vault.secrets(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE public.ai_usage_logs VALIDATE CONSTRAINT ai_usage_logs_user_id_fkey;
ALTER TABLE public.gmail_accounts VALIDATE CONSTRAINT gmail_accounts_user_id_fkey;
ALTER TABLE public.message_templates VALIDATE CONSTRAINT message_templates_user_id_fkey;
ALTER TABLE public.notifications VALIDATE CONSTRAINT notifications_user_id_fkey;
ALTER TABLE public.query_telemetry VALIDATE CONSTRAINT query_telemetry_user_id_fkey;
ALTER TABLE public.saved_filters VALIDATE CONSTRAINT saved_filters_user_id_fkey;
ALTER TABLE public.user_devices VALIDATE CONSTRAINT user_devices_user_id_fkey;
ALTER TABLE public.user_service_accounts VALIDATE CONSTRAINT user_service_accounts_user_id_fkey;
ALTER TABLE public.user_sessions VALIDATE CONSTRAINT user_sessions_user_id_fkey;
ALTER TABLE public.voice_command_logs VALIDATE CONSTRAINT voice_command_logs_user_id_fkey;
ALTER TABLE public.webauthn_challenges VALIDATE CONSTRAINT webauthn_challenges_user_id_fkey;
ALTER TABLE public.performance_snapshots VALIDATE CONSTRAINT performance_snapshots_profile_id_fkey;
ALTER TABLE public.whatsapp_connections VALIDATE CONSTRAINT whatsapp_connections_instance_token_secret_id_fkey;
