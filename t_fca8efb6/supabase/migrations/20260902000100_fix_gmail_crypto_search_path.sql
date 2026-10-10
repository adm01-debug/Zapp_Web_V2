-- CRITICAL FIX: encrypt_gmail_token / decrypt_gmail_token BROKEN
-- pgcrypto (pgp_sym_encrypt/pgp_sym_decrypt) is installed in the 'extensions' schema.
-- Previous deployment set search_path='public' only — functions fail at runtime with
-- "function pgp_sym_encrypt(text, text) does not exist".
-- Fix: extend search_path to include 'extensions'.

ALTER FUNCTION public.encrypt_gmail_token(text)
  SET search_path TO 'public', extensions;

ALTER FUNCTION public.decrypt_gmail_token(bytea)
  SET search_path TO 'public', extensions;
