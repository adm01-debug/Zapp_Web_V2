-- search_email_threads
-- Rollback: DROP FUNCTION IF EXISTS public.search_email_threads(uuid, text, integer, timestamptz, uuid); DROP FUNCTION IF EXISTS public.search_email_threads(uuid, text, integer, timestamptz); DROP INDEX IF EXISTS public.email_messages_body_text_trgm_idx; DROP INDEX IF EXISTS public.email_attachments_filename_trgm_idx;
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.search_email_threads(uuid, text, integer, timestamptz, uuid);
--   drop function if exists public.search_email_threads(uuid, text, integer, timestamptz);
--   drop index if exists public.email_messages_body_text_trgm_idx;
--   drop index if exists public.email_attachments_filename_trgm_idx;
--
-- PE-09 — busca de e-mail por CORPO e ANEXO, com escopo de conta (p_account).
-- O pedido: a busca antiga de email_threads (assunto/remetente) nao acha palavra que
-- esta so no corpo da mensagem nem nome de arquivo anexado. Esta RPC procura o termo
-- em email_threads (assunto/remetente/snippet), no corpo de email_messages.body_text e
-- no nome de email_attachments.filename, e diz onde casou (match_field) com um trecho
-- (match_snippet) para a lista trocar o assunto.
--
-- Assinatura: (p_account uuid, p_q text, p_limit integer, p_after timestamptz,
--              p_after_id uuid). p_after/p_after_id formam o cursor composto da
-- paginacao (timestamp + id); p_after_id NULL mantem o comportamento antigo
-- (so timestamp). p_account NULL devolve zero linhas (falha fechada, sem erro).
--
-- Desempenho: a funcao e LANGUAGE sql (inlinavel) com CTEs MATERIALIZED que
-- pre-filtram corpo e anexo com gmail_account_id = p_account AND ... ILIKE, para o
-- planejador usar os GIN de trigrama no plano REAL da chamada (sem truque de
-- enable_seqscan). Em plpgsql a funcao seria caixa-preta ("Function Scan"). Sem clausula SET de proposito: o SET impede o inline e esconderia o plano; a seguranca vem da qualificacao total (todo objeto com public. e so builtins do pg_catalog, imunes a search_path), provada no teste B.1c com schema hostil.
--
-- O termo e aparado, limitado a 120 caracteres e casado como literal com
-- ESCAPE '!': a exclamacao dobra primeiro e % e _ sao escapados com ela, entao
-- curinga do usuario nao vira curinga da busca (e a barra e um caractere comum).
-- Termo vazio ou so com espacos devolve zero linhas (nunca a caixa inteira).
-- O limite e forcado ao intervalo 1..100.
--
-- Indices GIN aqui (nao CONCURRENTLY: migration transacional precisa das duas
-- pontas juntas) + funcao SECURITY INVOKER (respeita a RLS de e-mail) + REVOKE/GRANT
-- explicitos + rollback executavel no topo.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS email_messages_body_text_trgm_idx
  ON public.email_messages USING gin (body_text extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS email_attachments_filename_trgm_idx
  ON public.email_attachments USING gin (filename extensions.gin_trgm_ops);

-- Remove a sobrecarga de 4 args da rodada 1 (se existir): o cursor passa a ser
-- composto (p_after + p_after_id) e so a assinatura de 5 args permanece.
DROP FUNCTION IF EXISTS public.search_email_threads(uuid, text, integer, timestamptz);

CREATE OR REPLACE FUNCTION public.search_email_threads(
  p_account uuid,
  p_q text,
  p_limit integer DEFAULT 20,
  p_after timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL
)
RETURNS TABLE (
  thread_id uuid,
  match_field text,
  match_snippet text,
  last_message_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $function$
  -- p_account NULL devolve zero linhas (a comparacao com NULL nunca casa);
  -- termo vazio tambem (guardas btrim(coalesce(p_q, '')) <> '').
  -- O padrao de LIKE abaixo usa ESCAPE '!': sem nenhuma barra no arquivo.
  WITH body_hits AS MATERIALIZED (
    SELECT DISTINCT m.thread_id AS thread_id
    FROM public.email_messages m
    WHERE btrim(coalesce(p_q, '')) <> ''
      AND m.gmail_account_id = p_account
      AND m.body_text ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!'
  ),
  att_hits AS MATERIALIZED (
    SELECT DISTINCT m.thread_id AS thread_id
    FROM public.email_messages m
    JOIN public.email_attachments a ON a.email_message_id = m.id
    WHERE btrim(coalesce(p_q, '')) <> ''
      AND m.gmail_account_id = p_account
      AND a.filename ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!'
  )
  SELECT h.thread_id, h.match_field, h.match_snippet, h.last_message_at
  FROM (
    SELECT
      t.id AS thread_id,
      t.last_message_at AS last_message_at,
      -- Onde casou, em ordem de prioridade: assunto > anexo > corpo > remetente > snippet.
      coalesce(
        CASE WHEN t.subject ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!' THEN 'subject' END,
        att.match_field,
        msg.match_field,
        CASE WHEN t.last_from_name ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!'
               OR t.last_from_address ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!' THEN 'from' END,
        CASE WHEN t.snippet ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!' THEN 'snippet' END
      ) AS match_field,
      -- Trecho mostrado na lista (o componente troca o assunto por ele, com fallback).
      coalesce(
        CASE WHEN t.subject ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!' THEN t.subject END,
        att.match_snippet,
        msg.match_snippet,
        CASE WHEN t.last_from_name ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!' THEN t.last_from_name
             WHEN t.last_from_address ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!' THEN t.last_from_address END,
        CASE WHEN t.snippet ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!' THEN t.snippet END
      ) AS match_snippet
    FROM public.email_threads t
    LEFT JOIN LATERAL (
      SELECT 'attachment'::text AS match_field,
             coalesce(a.filename, '') AS match_snippet
      FROM public.email_messages m
      JOIN public.email_attachments a ON a.email_message_id = m.id
      WHERE m.thread_id = t.id
        AND m.gmail_account_id = p_account
        AND a.filename ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!'
      ORDER BY m.internal_date DESC
      LIMIT 1
    ) att ON true
    LEFT JOIN LATERAL (
      SELECT 'body'::text AS match_field,
             substring(
               m.body_text
               FROM greatest(1, position(lower(left(btrim(coalesce(p_q, '')), 120)) IN lower(m.body_text)) - 40)
               FOR 160
             ) AS match_snippet
      FROM public.email_messages m
      WHERE m.thread_id = t.id
        AND m.gmail_account_id = p_account
        AND m.body_text ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!'
      ORDER BY m.internal_date DESC
      LIMIT 1
    ) msg ON true
    WHERE t.gmail_account_id = p_account
      AND btrim(coalesce(p_q, '')) <> ''
      AND (
        p_after IS NULL
        OR t.last_message_at < p_after
        OR (t.last_message_at = p_after AND p_after_id IS NOT NULL AND t.id < p_after_id)
      )
      AND (
        t.subject ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!'
        OR t.snippet ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!'
        OR t.last_from_name ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!'
        OR t.last_from_address ILIKE ('%' || replace(replace(replace(left(btrim(coalesce(p_q, '')), 120), '!', '!!'), '%', '!%'), '_', '!_') || '%') ESCAPE '!'
        OR EXISTS (SELECT 1 FROM body_hits b WHERE b.thread_id = t.id)
        OR EXISTS (SELECT 1 FROM att_hits ah WHERE ah.thread_id = t.id)
      )
    ORDER BY t.last_message_at DESC, t.id DESC
    LIMIT (least(greatest(coalesce(p_limit, 20), 1), 100))
  ) h;
$function$;

COMMENT ON FUNCTION public.search_email_threads(uuid, text, integer, timestamptz, uuid) IS
  'Busca de e-mail (PE-09) em LANGUAGE sql para o planejador inlinar: procura o termo em email_threads (assunto/remetente/snippet), no corpo de email_messages.body_text e no nome de email_attachments.filename, via CTEs MATERIALIZED pre-filtradas por conta (GIN de trigrama). SECURITY INVOKER: respeita a RLS de e-mail (limita ao que o usuario ve). Termo vazio e p_account NULL devolvem zero linhas. Termo casa como literal (ESCAPE "!"). Devolve (thread_id, match_field, match_snippet, last_message_at); cursor composto (p_after, p_after_id) para paginacao sem pular empates de last_message_at.';

-- ACL minima: ninguem alem dos dois papes de borda executa. O REVOKE vem ANTES dos
-- GRANTs e limpa PUBLIC e anon (o padrao do Postgres daria EXECUTE a PUBLIC, e o
-- privilegio padrao do Supabase daria a anon); os GRANTs abrem so authenticated e
-- service_role. Ordem importa: REVOKE depois do GRANT nao limparia concessao explicita.
REVOKE ALL ON FUNCTION public.search_email_threads(uuid, text, integer, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_email_threads(uuid, text, integer, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_email_threads(uuid, text, integer, timestamptz, uuid) TO service_role;
