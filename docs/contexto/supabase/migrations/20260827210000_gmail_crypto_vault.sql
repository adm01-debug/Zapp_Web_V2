DO $$ vault.create_secret gmail_encryption_key IF NOT EXISTS $$

CREATE OR REPLACE FUNCTION public.encrypt_gmail_token(p_token text) -- le vault.decrypted_secrets

CREATE OR REPLACE FUNCTION public.decrypt_gmail_token(p_encrypted bytea) -- le vault.decrypted_secrets

REVOKE/GRANT service_role
