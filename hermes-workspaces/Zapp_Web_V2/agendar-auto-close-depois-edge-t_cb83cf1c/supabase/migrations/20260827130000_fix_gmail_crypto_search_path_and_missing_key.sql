-- ============================================================================
-- FIX: encrypt_gmail_token / decrypt_gmail_token estavam quebradas de duas formas
-- ============================================================================
-- Data: 27/08/2026 · origem: execucao do plano da auditoria, item 3
-- Aplicado no destino em 27/08/2026.
--
-- Defeito 1 — search_path errado (falha garantida):
--   Ambas tinham SET search_path TO 'public', mas pgcrypto esta instalada no
--   schema 'extensions' neste projeto. Logo pgp_sym_encrypt/pgp_sym_decrypt
--   nunca eram resolviveis e a funcao falhava SEMPRE com
--   'function pgp_sym_encrypt(text, text) does not exist' — independente de
--   qualquer configuracao. Verificado:
--     SELECT n.nspname FROM pg_extension e
--     JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto';  -- extensions
--
-- Defeito 2 — chave ausente + funcao STRICT (pior que falhar):
--   app.encryption_key nao esta definida em lugar nenhum: nem na sessao, nem
--   em pg_db_role_setting (0 de 11 entradas mencionam app.*).
--   pgp_sym_encrypt e STRICT (proisstrict = true), entao pgp_sym_encrypt(txt, NULL)
--   retorna NULL em SILENCIO. Se alguem corrigisse apenas o search_path, o fluxo
--   Gmail passaria a gravar access_token_encrypted = NULL sem erro nenhum —
--   perda de dado silenciosa. Por isso agora ha RAISE EXCEPTION explicito.
--
-- Estas funcoes continuam ORFAS (achado A-06): nenhum .rpc() no app. O fluxo
-- Gmail esta desligado e gmail_accounts tem 0 linhas, entao a correcao nao muda
-- comportamento de nada em producao hoje. Ela impede o desastre no dia em que
-- o fluxo for ligado (etapas 59-61 do plano).
--
-- ANTES DE LIGAR O GMAIL: configurar app.encryption_key. Ver docs/SECURITY-DB.md.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.encrypt_gmail_token(p_token text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_key text;
BEGIN
  IF p_token IS NULL THEN RETURN NULL; END IF;
  v_key := current_setting('app.encryption_key', true);
  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE EXCEPTION 'app.encryption_key nao esta configurada; encrypt_gmail_token abortado'
      USING HINT = 'pgp_sym_encrypt e STRICT: com chave NULL retornaria NULL em silencio e gravaria token vazio. Ver docs/SECURITY-DB.md.';
  END IF;
  RETURN extensions.pgp_sym_encrypt(p_token, v_key);
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_gmail_token(p_encrypted bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_key text;
BEGIN
  IF p_encrypted IS NULL THEN RETURN NULL; END IF;
  v_key := current_setting('app.encryption_key', true);
  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE EXCEPTION 'app.encryption_key nao esta configurada; decrypt_gmail_token abortado'
      USING HINT = 'Ver docs/SECURITY-DB.md.';
  END IF;
  RETURN extensions.pgp_sym_decrypt(p_encrypted, v_key);
END;
$function$;

COMMENT ON FUNCTION public.encrypt_gmail_token(text) IS
'ORFA em 2026-08-27 (A-06), mas CORRIGIDA em 27/08/2026: search_path era public e pgcrypto vive em extensions, entao a funcao falhava sempre com "pgp_sym_encrypt does not exist". Agora schema-qualificada. Alem disso pgp_sym_encrypt e STRICT: sem app.encryption_key retornaria NULL em silencio, gravando token vazio - por isso agora levanta excecao explicita. Requer app.encryption_key configurada antes de ligar o fluxo Gmail.';

COMMENT ON FUNCTION public.decrypt_gmail_token(bytea) IS
'ORFA em 2026-08-27 (A-06), mas CORRIGIDA em 27/08/2026: mesmo defeito de search_path da encrypt_gmail_token. Requer app.encryption_key configurada.';

-- Teste de aceitacao executado em 27/08/2026 (chave efemera, transaction-local):
--   sem GUC                    -> RAISE EXCEPTION (correto, nao retorna NULL)
--   com set_config(...,true)   -> encrypt_ok = true, roundtrip_ok = true
--   proconfig final            -> {search_path=public, extensions}
