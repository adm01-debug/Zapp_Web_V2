CREATE OR REPLACE FUNCTION public.search_email_threads(p_account uuid, p_q text, p_limit integer DEFAULT 20, p_after timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(thread_id uuid, match_field text, match_snippet text, last_message_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
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
$function$
