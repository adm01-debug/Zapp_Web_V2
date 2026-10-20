-- Kill switch da API publica legada.
-- O token era global, recuperavel pelo frontend e comparado em texto puro.
-- Credenciais futuras devem viver em tabela dedicada, somente como hash,
-- vinculadas a tenant/escopos e gerenciadas exclusivamente no servidor.

BEGIN;

DELETE FROM public.global_settings
WHERE key = 'api_token';

ALTER TABLE public.global_settings
  DROP CONSTRAINT IF EXISTS global_settings_no_plaintext_api_token;

ALTER TABLE public.global_settings
  ADD CONSTRAINT global_settings_no_plaintext_api_token
  CHECK (key <> 'api_token') NOT VALID;

ALTER TABLE public.global_settings
  VALIDATE CONSTRAINT global_settings_no_plaintext_api_token;

COMMENT ON CONSTRAINT global_settings_no_plaintext_api_token
  ON public.global_settings IS
  'Impede armazenamento do token global plaintext removido da API publica legada.';

COMMIT;
