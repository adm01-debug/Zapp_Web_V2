ALTER TABLE public.ai_usage_logs DROP CONSTRAINT ai_usage_logs_user_id_fkey

ALTER TABLE public.ai_usage_logs ADD CONSTRAINT ai_usage_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL

ALTER TABLE public.query_telemetry DROP CONSTRAINT query_telemetry_user_id_fkey

ALTER TABLE public.query_telemetry ADD CONSTRAINT query_telemetry_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL

ALTER TABLE public.ai_usage_logs DROP CONSTRAINT ai_usage_logs_profile_id_fkey

ALTER TABLE public.ai_usage_logs ADD CONSTRAINT ai_usage_logs_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL
