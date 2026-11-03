ALTER TABLE public.ai_usage_logs ADD CONSTRAINT ai_usage_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID

ALTER TABLE public.gmail_accounts ADD CONSTRAINT gmail_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID

ALTER TABLE public.message_templates ADD CONSTRAINT message_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID

ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID

ALTER TABLE public.query_telemetry ADD CONSTRAINT query_telemetry_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID

ALTER TABLE public.saved_filters ADD CONSTRAINT saved_filters_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID

ALTER TABLE public.user_devices ADD CONSTRAINT user_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID

ALTER TABLE public.user_service_accounts ADD CONSTRAINT user_service_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID

ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID

ALTER TABLE public.voice_command_logs ADD CONSTRAINT voice_command_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID

ALTER TABLE public.webauthn_challenges ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID

ALTER TABLE public.performance_snapshots ADD CONSTRAINT performance_snapshots_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID

ALTER TABLE public.whatsapp_connections ADD CONSTRAINT whatsapp_connections_instance_token_secret_id_fkey FOREIGN KEY (instance_token_secret_id) REFERENCES vault.secrets(id) ON DELETE SET NULL NOT VALID

ALTER TABLE public.ai_usage_logs VALIDATE CONSTRAINT ai_usage_logs_user_id_fkey

ALTER TABLE public.gmail_accounts VALIDATE CONSTRAINT gmail_accounts_user_id_fkey

ALTER TABLE public.message_templates VALIDATE CONSTRAINT message_templates_user_id_fkey

ALTER TABLE public.notifications VALIDATE CONSTRAINT notifications_user_id_fkey

ALTER TABLE public.query_telemetry VALIDATE CONSTRAINT query_telemetry_user_id_fkey

ALTER TABLE public.saved_filters VALIDATE CONSTRAINT saved_filters_user_id_fkey

ALTER TABLE public.user_devices VALIDATE CONSTRAINT user_devices_user_id_fkey

ALTER TABLE public.user_service_accounts VALIDATE CONSTRAINT user_service_accounts_user_id_fkey

ALTER TABLE public.user_sessions VALIDATE CONSTRAINT user_sessions_user_id_fkey

ALTER TABLE public.voice_command_logs VALIDATE CONSTRAINT voice_command_logs_user_id_fkey

ALTER TABLE public.webauthn_challenges VALIDATE CONSTRAINT webauthn_challenges_user_id_fkey

ALTER TABLE public.performance_snapshots VALIDATE CONSTRAINT performance_snapshots_profile_id_fkey

ALTER TABLE public.whatsapp_connections VALIDATE CONSTRAINT whatsapp_connections_instance_token_secret_id_fkey
