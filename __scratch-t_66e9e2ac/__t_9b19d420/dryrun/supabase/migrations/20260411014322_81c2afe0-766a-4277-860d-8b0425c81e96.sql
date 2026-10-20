
-- Enable pgcrypto if not already
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted columns
ALTER TABLE public.gmail_accounts 
  ADD COLUMN IF NOT EXISTS access_token_encrypted bytea,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted bytea;

-- Create encrypt/decrypt functions using a fixed app key from env
-- These are SECURITY DEFINER so only the function owner (postgres) can use the key
CREATE OR REPLACE FUNCTION public.encrypt_gmail_token(p_token text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_encrypt(p_token, current_setting('app.encryption_key', true));
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_gmail_token(p_encrypted bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_encrypted IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(p_encrypted, current_setting('app.encryption_key', true));
END;
$$;

-- Revoke direct access to these functions from authenticated users
REVOKE EXECUTE ON FUNCTION public.encrypt_gmail_token(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_gmail_token(bytea) FROM authenticated;
