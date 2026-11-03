CREATE OR REPLACE FUNCTION public.encrypt_gmail_token(p_token text)
 RETURNS bytea
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
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
$function$
