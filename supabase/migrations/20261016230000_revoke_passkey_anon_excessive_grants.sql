-- P0: anon tem TRUNCATE + TRIGGER em passkey_credentials
-- RLS bloqueia DELETE/UPDATE/SELECT por deny-by-default (sem policy para anon),
-- mas TRUNCATE **ignora RLS** no PostgreSQL — anon poderia apagar todas as
-- passkeys sem autenticação. TRIGGER permite criar gatilhos na tabela.
-- Revoga tudo que anon não deve ter além do INSERT já revogado anteriormente.

REVOKE SELECT    ON public.passkey_credentials FROM anon;
REVOKE UPDATE    ON public.passkey_credentials FROM anon;
REVOKE DELETE    ON public.passkey_credentials FROM anon;
REVOKE TRUNCATE  ON public.passkey_credentials FROM anon;
REVOKE TRIGGER   ON public.passkey_credentials FROM anon;
REVOKE REFERENCES ON public.passkey_credentials FROM anon;
