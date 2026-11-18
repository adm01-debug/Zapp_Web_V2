CREATE OR REPLACE FUNCTION public.decrypt_gmail_token(p_encrypted bytea)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
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
$function$
