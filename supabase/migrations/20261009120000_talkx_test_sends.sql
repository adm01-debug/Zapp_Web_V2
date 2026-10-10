-- N-104 · Talk X: trilha e limite do envio de teste
-- Rollback: DROP TABLE IF EXISTS public.talkx_test_sends; DELETE FROM public.talkx_settings WHERE key = 'test_send_limit';
--
-- `template_id`, `campaign_id` e `created_by` são NULLABLE: um envio de teste
-- não pertence a template/campanha e pode ser disparado por serviço/cron (sem
-- ator). Com NOT NULL nessas colunas, o INSERT de auditoria do index.ts era
-- recusado em TODA chamada e a trilha nunca gravava.

CREATE TABLE IF NOT EXISTS public.talkx_test_sends (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid REFERENCES public.talkx_templates(id),
  campaign_id       uuid REFERENCES public.talkx_campaigns(id),
  connection_id     uuid NOT NULL REFERENCES public.whatsapp_connections(id),
  to_phone          text NOT NULL,
  status            text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  error             text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.talkx_test_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.talkx_test_sends FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.talkx_test_sends TO service_role;

-- `CREATE POLICY IF NOT EXISTS` não existe no Postgres; a migration falhava.
-- DROP + CREATE deixa a migration reaplicável.
DROP POLICY IF EXISTS "talkx_test_sends_owner_admin_read" ON public.talkx_test_sends;
CREATE POLICY "talkx_test_sends_owner_admin_read"
  ON public.talkx_test_sends FOR SELECT
  TO authenticated
  USING (
    auth.uid() = created_by
    OR auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

DROP POLICY IF EXISTS "talkx_test_sends_service_role_write" ON public.talkx_test_sends;
CREATE POLICY "talkx_test_sends_service_role_write"
  ON public.talkx_test_sends FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.talkx_settings (key, value, description)
VALUES ('test_send_limit', '5', 'Limite de envios de teste por janela de 10 minutos')
ON CONFLICT (key) DO NOTHING;
