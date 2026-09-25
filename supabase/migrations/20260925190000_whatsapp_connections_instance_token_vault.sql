-- E08/E09 do plano multi-conexao Evolution GO
-- (docs/audits/PLANO_MULTI_CONEXAO_EVOLUTION_GO_50_ETAPAS_2026-09-25.md).
-- Fundacao para token por instancia no Vault, no lugar do secret global
-- EVOLUTION_INSTANCE_TOKEN -- hoje uma 2a conexao herdaria o token da
-- PRINCIPAL (inoperante) porque nao ha onde guardar credencial por linha.
--
-- Aditiva e compativel com o codigo atual de main (coluna nullable, indices
-- novos, funcoes novas que nada em producao ainda chama) -- aplicada antes
-- do merge pela excecao do CLAUDE.md 1.6 (o supabase-usage-guard precisa do
-- catalogo regenerado a partir do banco vivo para o PR fechar).

-- 1) Coluna que liga a conexao ao segredo no Vault.
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS instance_token_secret_id uuid;

-- 2) Hoje nada impede 2 linhas com o mesmo instance_id -- getConnectionByInstance
-- e handleConnectionUpdate usam .single()/.maybeSingle() e quebrariam com
-- duplicata quando a 2a instancia existir de verdade.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_connections_instance_id_key
  ON public.whatsapp_connections (instance_id)
  WHERE instance_id IS NOT NULL;

-- 3) Garante no maximo 1 conexao padrao (E35 do plano depende disto --
-- useConnectionsManager.setDefault hoje faz 2 UPDATEs separados sem isto).
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_connections_one_default
  ON public.whatsapp_connections (is_default)
  WHERE is_default;

-- 4) Leitura do token -- espelha o guard de claim_outbound_message
-- (SECURITY DEFINER, service_role apenas). NULL quando a conexao nao tem
-- token proprio ainda (fallback do codigo decide o que fazer).
CREATE OR REPLACE FUNCTION public.get_instance_token(p_instance_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $function$
DECLARE
  v_secret_id uuid;
  v_token text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT instance_token_secret_id INTO v_secret_id
  FROM public.whatsapp_connections
  WHERE instance_id = p_instance_id;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;

  RETURN v_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_instance_token(text) FROM PUBLIC, anon, authenticated;

-- 5) Grava/atualiza o token -- cria o segredo na 1a vez, atualiza nas
-- seguintes (nunca duplica secret por conexao).
CREATE OR REPLACE FUNCTION public.set_instance_token(p_connection_id uuid, p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $function$
DECLARE
  v_existing uuid;
  v_secret_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_connection_id IS NULL OR p_token IS NULL OR p_token = '' THEN
    RAISE EXCEPTION 'invalid_instance_token' USING ERRCODE = '22023';
  END IF;

  SELECT instance_token_secret_id INTO v_existing
  FROM public.whatsapp_connections
  WHERE id = p_connection_id;

  IF v_existing IS NULL THEN
    v_secret_id := vault.create_secret(p_token, 'whatsapp_instance_token:' || p_connection_id::text);
    UPDATE public.whatsapp_connections
    SET instance_token_secret_id = v_secret_id
    WHERE id = p_connection_id;
  ELSE
    PERFORM vault.update_secret(v_existing, p_token);
    v_secret_id := v_existing;
  END IF;

  RETURN v_secret_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_instance_token(uuid, text) FROM PUBLIC, anon, authenticated;
