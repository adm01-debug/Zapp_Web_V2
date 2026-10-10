-- 20260827210000_gmail_crypto_vault
--
-- DECISAO (Joaquim, 27/08/2026): chave de cripto dos tokens Gmail no VAULT,
-- nao em GUC. Motivos: (a) vault entra no backup do Supabase, GUC de database
-- (pg_db_role_setting) fica fora do dump logico; (b) padrao ja existente no
-- codebase (notify_sicoob_on_reply le sicoob_service_role_key do vault).
--
-- A chave e GERADA DENTRO do banco (gen_random_bytes) — nunca aparece em
-- migration, log ou output. Em banco novo, o DO abaixo gera chave nova (ok:
-- sem ciphertext legado). No banco oficial, e idempotente (secret ja existe).
--
-- ATENCAO RESTORE: o ciphertext em gmail_accounts.*_encrypted so e legivel
-- com o MESMO secret. Se o vault for perdido, os tokens exigem re-auth OAuth
-- (sem perda de dados de negocio — Gmail re-emite tokens no proximo consent).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='gmail_encryption_key') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'gmail_encryption_key',
      'Chave simetrica pgp_sym_encrypt dos tokens Gmail (gmail_accounts.*_encrypted). Gerada in-db 2026-08-27. NUNCA logar.'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.encrypt_gmail_token(p_token text)
RETURNS bytea
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_key text;
BEGIN
  -- Chave vive no vault (dentro do backup do Supabase), padrao ja usado por
  -- notify_sicoob_on_reply. Nao usa GUC: sobrevive a restore logico.
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'gmail_encryption_key'
  LIMIT 1;

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'gmail_encryption_key ausente no vault; encrypt_gmail_token abortado'
      USING HINT = 'pgp_sym_encrypt e STRICT: com chave NULL retornaria NULL em silencio e gravaria token vazio. Recrie o secret no vault. Ver docs/DB-SECURITY.md.';
  END IF;

  RETURN pgp_sym_encrypt(p_token, v_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_gmail_token(p_encrypted bytea)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
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

  RETURN pgp_sym_decrypt(p_encrypted, v_key);
END;
$$;

-- ACL: mantem o lock (so postgres + service_role executam)
REVOKE ALL ON FUNCTION public.encrypt_gmail_token(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrypt_gmail_token(bytea) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_gmail_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_gmail_token(bytea) TO service_role;
