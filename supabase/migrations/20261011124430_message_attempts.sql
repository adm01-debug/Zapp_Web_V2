-- message_attempts
-- Rollback: tudo desta migration e NOVO, entao o inverso e so dropar as funcoes e a tabela (que leva junto a policy e as ACLs).
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.list_message_attempts_admin(uuid);
--   drop function if exists public.list_message_attempts(uuid);
--   drop function if exists public.log_message_attempt(uuid, integer, text, text, text, integer, jsonb, integer);
--   drop table if exists public.message_attempts;
--
-- AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1 (11/10/2026), faixa C.
-- DEFEITO: a V2 so guarda o ultimo status e a contagem (messages.status,
-- status_updated_at, delivery_attempt_count). O erro do provedor de cada
-- tentativa se perde, entao o Historico de envio nao diz POR QUE falhou.
--
-- Esta migration e ADITIVA: cria a tabela de tentativas, duas funcoes de
-- leitura (resumo por conversa e visao completa do admin) e uma de escrita
-- (so o service_role / Edge). Nenhum dado pessoal entra aqui: error_message e
-- provider_response chegam JA SANITIZADOS pelo produtor (Edge funciona como
-- service_role); nada de telefone nem texto de mensagem.
--
-- Efeitos colaterais: nenhum. Nao ha trigger novo (nao toca messages nem o
-- updated_at de nada), nao ha publicacao de realtime e nenhum GRANT/REVOKE
-- muda objeto que ja existia. O unico acesso retirado e o que ainda nao
-- existia (a tabela nasce fechada).
--
-- MENSAGEM JA ENVIADA NAO TEM ROLLBACK de conteudo: o DROP TABLE do rollback
-- devolve o schema, mas o historico de tentativas gravado se perde.

BEGIN;

-- 1) Tabela de tentativas de envio por mensagem ---------------------------
-- O payload do provedor pode conter dado pessoal: por isso a leitura direta
-- na tabela fica restrita ao admin (RLS abaixo) e a Edge so ESCREVE.
CREATE TABLE IF NOT EXISTS public.message_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL,
  outcome text NOT NULL,
  error_code text,
  error_message text,
  provider_status integer,
  provider_response jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_attempts_outcome_check
    CHECK (outcome IN ('claimed', 'sent', 'failed_retryable', 'failed_final')),
  CONSTRAINT message_attempts_error_message_len_check
    CHECK (error_message IS NULL OR length(error_message) <= 500),
  CONSTRAINT message_attempts_unique
    UNIQUE (message_id, attempt_no, outcome)
);

CREATE INDEX IF NOT EXISTS message_attempts_message_created_idx
  ON public.message_attempts (message_id, created_at);

-- 2) RLS: leitura direta SO para is_admin(); a API nao escreve direto ------
ALTER TABLE public.message_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_attempts_select_admin ON public.message_attempts;
CREATE POLICY message_attempts_select_admin
  ON public.message_attempts
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ACL: nega por padrao. anon nada; authenticated so SELECT (limitado pela
-- policy acima); nenhum INSERT/UPDATE/DELETE direto para authenticated.
REVOKE ALL PRIVILEGES ON TABLE public.message_attempts FROM anon, authenticated;
GRANT SELECT ON TABLE public.message_attempts TO authenticated;

-- 3) Escrita: log_message_attempt (SECURITY DEFINER, so service_role) ------
-- A Edge chama com a service key. A barreira e o EXECUTE: PUBLIC, anon e
-- authenticated nao podem chamar. Idempotente pela chave unica: repetir a
-- mesma (message_id, attempt_no, outcome) nao duplica e devolve false.
CREATE OR REPLACE FUNCTION public.log_message_attempt(
  p_message_id uuid,
  p_attempt_no integer,
  p_outcome text,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_provider_status integer DEFAULT NULL,
  p_provider_response jsonb DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_outcome IS NULL
     OR p_outcome NOT IN ('claimed', 'sent', 'failed_retryable', 'failed_final') THEN
    RAISE EXCEPTION 'invalid_outcome: %', p_outcome USING ERRCODE = '22023';
  END IF;

  IF p_attempt_no IS NULL OR p_attempt_no < 1 THEN
    RAISE EXCEPTION 'invalid_attempt_no: %', p_attempt_no USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.messages AS m WHERE m.id = p_message_id) THEN
    RAISE EXCEPTION 'message_not_found: %', p_message_id USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.message_attempts (
    message_id, attempt_no, outcome, error_code, error_message,
    provider_status, provider_response, duration_ms
  ) VALUES (
    p_message_id, p_attempt_no, p_outcome, p_error_code, p_error_message,
    p_provider_status, p_provider_response, p_duration_ms
  )
  ON CONFLICT (message_id, attempt_no, outcome) DO NOTHING;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION
  public.log_message_attempt(uuid, integer, text, text, text, integer, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.log_message_attempt(uuid, integer, text, text, text, integer, jsonb, integer)
  TO service_role;

-- 4) Leitura por conversa: resumo SEM provider_response ---------------------
-- Espelha a RLS de messages: quem consegue ler a mensagem le o resumo das
-- tentativas. SECURITY DEFINER porque a policy da tabela so abre para admin;
-- a checagem explicita (is_contact_visible_to_user, caller-bound) e a barreira.
CREATE OR REPLACE FUNCTION public.list_message_attempts(p_message_id uuid)
RETURNS TABLE (
  attempt_no integer,
  outcome text,
  error_code text,
  error_message text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.messages AS m
    WHERE m.id = p_message_id
      AND public.is_contact_visible_to_user(m.contact_id, auth.uid())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT a.attempt_no, a.outcome, a.error_code, a.error_message, a.created_at
    FROM public.message_attempts AS a
    WHERE a.message_id = p_message_id
    ORDER BY a.created_at DESC, a.attempt_no DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_message_attempts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_message_attempts(uuid)
  TO authenticated, service_role;

-- 5) Leitura completa: so admin, COM provider_response ----------------------
CREATE OR REPLACE FUNCTION public.list_message_attempts_admin(p_message_id uuid)
RETURNS TABLE (
  attempt_no integer,
  outcome text,
  error_code text,
  error_message text,
  provider_response jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT a.attempt_no, a.outcome, a.error_code, a.error_message,
           a.provider_response, a.created_at
    FROM public.message_attempts AS a
    WHERE a.message_id = p_message_id
    ORDER BY a.created_at DESC, a.attempt_no DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_message_attempts_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_message_attempts_admin(uuid)
  TO authenticated, service_role;

COMMIT;
