-- Restringe a dead-letter queue de webhooks a service_role.
--
-- A policy original foi criada sem clausula TO e, portanto, aplicava-se a
-- PUBLIC. Combinada aos default grants do schema, isso concedia acesso efetivo
-- a anon e authenticated sobre payloads e mensagens de erro.

ALTER TABLE public.webhook_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full" ON public.webhook_failures;

CREATE POLICY "service_role_full"
  ON public.webhook_failures
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL PRIVILEGES ON TABLE public.webhook_failures FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.webhook_failures FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.webhook_failures TO service_role;

