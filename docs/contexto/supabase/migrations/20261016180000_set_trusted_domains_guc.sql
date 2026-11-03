CREATE TABLE IF NOT EXISTS public.app_settings (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY

CREATE POLICY app_settings_admin_all ON public.app_settings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'admin'))

INSERT INTO public.app_settings (key, value) VALUES ('trusted_domains', 'promobrindes.com.br') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()

CREATE OR REPLACE FUNCTION public.handle_new_user_role() -- reads trusted_domains from app_settings
