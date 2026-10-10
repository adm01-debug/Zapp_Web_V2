-- N-104 · Talk X: trilha e limite do envio de teste

-- Rollback:
-- Rollback (SQL executável, na ordem):
--   DELETE FROM public.talkx_settings WHERE key = 'test_send_limit';
--   DROP POLICY IF EXISTS public.talkx_test_sends_service_role_write;
--   DROP POLICY IF EXISTS public.talkx_test_sends_owner_admin_read;
--   REVOKE ALL ON public.talkx_test_sends FROM PUBLIC, anon, authenticated, service_role;
--   DROP TABLE IF EXISTS public.talkx_test_sends;

CREATE TABLE IF NOT EXISTS public.talkx_test_sends (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid NOT NULL REFERENCES public.talkx_templates(id),
  campaign_id       uuid NOT NULL REFERENCES public.talkx_campaigns(id),
  connection_id     uuid NOT NULL REFERENCES public.whatsapp_connections(id),
  to_phone          text NOT NULL,
  status            text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  error             text,
  created_by        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.talkx_test_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.talkx_test_sends FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.talkx_test_sends TO service_role;

CREATE POLICY IF NOT EXISTS "talkx_test_sends_owner_admin_read"
  ON public.talkx_test_sends FOR SELECT
  TO authenticated
  USING (
    auth.uid() = created_by
    OR auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY IF NOT EXISTS "talkx_test_sends_service_role_write"
  ON public.talkx_test_sends FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.talkx_settings (key, value, description)
VALUES ('test_send_limit', '5', 'Limite de envios de teste por janela de 10 minutos')
ON CONFLICT (key) DO NOTHING;