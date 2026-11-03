-- Fix: decrypt_gmail_token e encrypt_gmail_token falhavam com
-- "function pgp_sym_decrypt(bytea, text) does not exist"
-- porque search_path=public nao inclui o schema extensions onde
-- pgcrypto instala as funcoes pgp_sym_*.
-- Fix: adicionar extensions ao search_path e chamar com schema qualificado.

CREATE OR REPLACE FUNCTION public.decrypt_gmail_token(p_encrypted bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_encrypted IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'gmail_encryption_key'
  LIMIT 1;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'gmail_encryption_key ausente no vault; decrypt_gmail_token abortado'
      USING HINT = 'Sem a chave o ciphertext e ilegivel. Recrie o secret no vault com a MESMA chave ou os tokens precisam de re-auth OAuth. Ver docs/DB-SECURITY.md.';
  END IF;
  RETURN extensions.pgp_sym_decrypt(p_encrypted, v_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.encrypt_gmail_token(p_token text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'gmail_encryption_key'
  LIMIT 1;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'gmail_encryption_key ausente no vault; encrypt_gmail_token abortado'
      USING HINT = 'pgp_sym_encrypt e STRICT: com chave NULL retornaria NULL em silencio e gravaria token vazio. Recrie o secret no vault. Ver docs/DB-SECURITY.md.';
  END IF;
  RETURN extensions.pgp_sym_encrypt(p_token, v_key);
END;
$$;
