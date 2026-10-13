-- search_email_threads
-- Rollback: DROP FUNCTION IF EXISTS public.search_email_threads(uuid, text, integer, timestamptz); DROP INDEX IF EXISTS public.email_messages_body_text_trgm_idx; DROP INDEX IF EXISTS public.email_attachments_filename_trgm_idx;
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.search_email_threads(uuid, text, integer, timestamptz);
--   drop index if exists public.email_messages_body_text_trgm_idx;
--   drop index if exists public.email_attachments_filename_trgm_idx;
--
-- Auditoria de paridade V3 -> V2 (docs 10..40), achado PE-09 (t_59d66c7a):
-- a caixa promete "Buscar e-mails, remetentes, assuntos, anexos" (EmailChatInbox.tsx:252),
-- mas emailThreadSearchOr (src/lib/emailThreadQuery.ts:115) so procura em email_threads
-- (subject, snippet, last_from_name, last_from_address). A busca NAO alcanca o corpo da
-- mensagem nem o nome do anexo, que so existem em email_messages/email_attachments.
--
-- Esta migracao entrega a RPC que o pre-filtro da caixa consome:
--   public.search_email_threads(p_account uuid, p_q text, p_limit integer, p_after timestamptz)
--     -> (thread_id, match_field, match_snippet, last_message_at)
--
-- SECURITY INVOKER (padrao): a funcao roda como o chamador e NAO fura a RLS de
-- email_threads/email_messages/email_attachments. O predicado de visibilidade vigente
-- (dono da conta ou admin/supervisor, via gmail_accounts) vale sem ser copiado aqui --
-- por isso a busca e "limitada ao que o usuario ve" mesmo se a politica mudar depois.
--
-- Termo sanitizado: trim, corte em 120 chars, e os curingas de LIKE (% _ \) escapados
-- para virarem literais. Termo vazio (ou so espacos) devolve ZERO linhas -- nunca a caixa
-- inteira. Sem regex do usuario.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Indices GIN de trigrama para o ILIKE '%termo%'. CREATE INDEX CONCURRENTLY nao pode:
-- migrations rodam dentro de uma transacao (o CONCURRENTLY e proibido em bloco) e, no
-- volume atual dessas duas tabelas, o build comum e curto. O indice de trigrama so e
-- aproveitado a partir de 3 caracteres; termos mais curtos caem em varredura (aceitavel).
CREATE INDEX IF NOT EXISTS email_messages_body_text_trgm_idx
  ON public.email_messages USING gin (body_text extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS email_attachments_filename_trgm_idx
  ON public.email_attachments USING gin (filename extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_email_threads(
  p_account uuid,
  p_q text,
  p_limit integer DEFAULT 20,
  p_after timestamptz DEFAULT NULL
)
RETURNS TABLE (
  thread_id uuid,
  match_field text,
  match_snippet text,
  last_message_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_term text;
  v_pattern text;
  v_limit integer;
BEGIN
  IF p_account IS NULL THEN
    RAISE EXCEPTION 'search_email_threads: p_account obrigatorio'
      USING ERRCODE = '22023';
  END IF;

  v_term := btrim(coalesce(p_q, ''));
  IF v_term = '' THEN
    -- Termo vazio NUNCA devolve a caixa inteira: devolve nada.
    RETURN;
  END IF;

  IF char_length(v_term) > 120 THEN
    v_term := left(v_term, 120);
  END IF;

  -- Escapa os curingas de LIKE (barra primeiro) para o termo casar como literal.
  v_pattern := '%'
    || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_')
    || '%';

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 100);

  RETURN QUERY
  SELECT h.thread_id, h.match_field, h.match_snippet, h.last_message_at
  FROM (
    SELECT
      t.id AS thread_id,
      t.last_message_at AS last_message_at,
      -- Onde casou, em ordem de prioridade: assunto > anexo > corpo > remetente > snippet.
      coalesce(
        CASE WHEN t.subject ILIKE v_pattern THEN 'subject' END,
        att.match_field,
        msg.match_field,
        CASE WHEN t.last_from_name ILIKE v_pattern
               OR t.last_from_address ILIKE v_pattern THEN 'from' END,
        CASE WHEN t.snippet ILIKE v_pattern THEN 'snippet' END
      ) AS match_field,
      -- Trecho mostrado na lista (o componente troca o assunto por ele, com fallback).
      coalesce(
        CASE WHEN t.subject ILIKE v_pattern THEN t.subject END,
        att.match_snippet,
        msg.match_snippet,
        CASE WHEN t.last_from_name ILIKE v_pattern THEN t.last_from_name
             WHEN t.last_from_address ILIKE v_pattern THEN t.last_from_address END,
        CASE WHEN t.snippet ILIKE v_pattern THEN t.snippet END
      ) AS match_snippet
    FROM public.email_threads t
    LEFT JOIN LATERAL (
      SELECT 'attachment'::text AS match_field,
             coalesce(a.filename, '') AS match_snippet
      FROM public.email_messages m
      JOIN public.email_attachments a ON a.email_message_id = m.id
      WHERE m.thread_id = t.id
        AND a.filename ILIKE v_pattern
      ORDER BY m.internal_date DESC
      LIMIT 1
    ) att ON true
    LEFT JOIN LATERAL (
      SELECT 'body'::text AS match_field,
             substring(
               m.body_text
               FROM greatest(1, position(lower(v_term) IN lower(m.body_text)) - 40)
               FOR 160
             ) AS match_snippet
      FROM public.email_messages m
      WHERE m.thread_id = t.id
        AND m.body_text ILIKE v_pattern
      ORDER BY m.internal_date DESC
      LIMIT 1
    ) msg ON true
    WHERE t.gmail_account_id = p_account
      AND (p_after IS NULL OR t.last_message_at < p_after)
      AND (
        t.subject ILIKE v_pattern
        OR t.snippet ILIKE v_pattern
        OR t.last_from_name ILIKE v_pattern
        OR t.last_from_address ILIKE v_pattern
        OR att.match_field IS NOT NULL
        OR msg.match_field IS NOT NULL
      )
    ORDER BY t.last_message_at DESC, t.id DESC
    LIMIT v_limit
  ) h;

  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.search_email_threads(uuid, text, integer, timestamptz) IS
  'Busca de e-mail (PE-09): procura o termo em email_threads (assunto/remetente/snippet), no corpo de email_messages.body_text e no nome de email_attachments.filename. SECURITY INVOKER: respeita a RLS de e-mail (limita ao que o usuario ve). Termo vazio devolve zero linhas. Devolve (thread_id, match_field, match_snippet, last_message_at); p_after e cursor de last_message_at para paginacao.';

REVOKE ALL ON FUNCTION public.search_email_threads(uuid, text, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_email_threads(uuid, text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_email_threads(uuid, text, integer, timestamptz) TO service_role;
