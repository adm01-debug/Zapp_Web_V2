-- 20260827210100_gmail_token_rpcs
--
-- Cria get_gmail_tokens / store_gmail_tokens — os RPCs que os 4 modulos Gmail
-- (gmail-oauth, gmail-send, gmail-webhook, _shared/gmail-helpers) ja chamavam
-- sem que existissem no banco (fluxo Gmail 100% morto ate aqui).
--
-- Contratos extraidos dos call sites reais (PostgREST casa parametro por NOME):
--   get:   rpc("get_gmail_tokens", { p_account_id })
--          -> data[0] = { access_token, refresh_token }  (TABLE, nao json)
--   store: rpc("store_gmail_tokens", { p_account_id, p_access_token, p_refresh_token })
--          p_refresh_token pode vir null/"" — nesse caso PRESERVA o refresh
--          existente (o Google so devolve refresh_token no primeiro consent;
--          sobrescrever com vazio mataria a renovacao permanente).
--   token_expires_at NAO entra aqui: gmail-oauth grava no upsert da conta.

CREATE OR REPLACE FUNCTION public.get_gmail_tokens(p_account_id uuid)
RETURNS TABLE(access_token text, refresh_token text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    public.decrypt_gmail_token(a.access_token_encrypted),
    public.decrypt_gmail_token(a.refresh_token_encrypted)
  FROM public.gmail_accounts a
  WHERE a.id = p_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_gmail_tokens(
  p_account_id uuid,
  p_access_token text,
  p_refresh_token text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF p_access_token IS NULL OR p_access_token = '' THEN
    RAISE EXCEPTION 'store_gmail_tokens: p_access_token vazio para conta %', p_account_id;
  END IF;

  UPDATE public.gmail_accounts
  SET access_token_encrypted = public.encrypt_gmail_token(p_access_token),
      refresh_token_encrypted = CASE
        WHEN p_refresh_token IS NULL OR p_refresh_token = ''
        THEN refresh_token_encrypted  -- preserva: Google nao reenviou o refresh
        ELSE public.encrypt_gmail_token(p_refresh_token)
      END,
      updated_at = now()
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_gmail_tokens: conta % nao encontrada', p_account_id;
  END IF;
END;
$$;

-- ACL: edges usam service_role; o front NUNCA chama direto (tokens nao vao ao cliente)
REVOKE ALL ON FUNCTION public.get_gmail_tokens(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_gmail_tokens(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_gmail_tokens(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_gmail_tokens(uuid, text, text) TO service_role;
