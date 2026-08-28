-- Fix M-02 + M-03: search_contacts fazia dois full table scans separados.
--   Scan 1: SELECT COUNT(*) INTO v_total FROM contacts WHERE ...
--   Scan 2: RETURN QUERY SELECT ... FROM contacts WHERE ... LIMIT/OFFSET
-- Fix: COUNT(*) OVER () window function inline no RETURN QUERY = 1 scan único.
-- NULLS LAST adicionado na ordenação para comportamento determinístico.
-- Nota: SECURITY DEFINER intencional — todos os agentes veem todos os contatos
-- (decisão de produto; documentada como M-01 pending).
CREATE OR REPLACE FUNCTION public.search_contacts(
  search_term         text        DEFAULT '',
  contact_type_filter text        DEFAULT NULL,
  company_filter      text        DEFAULT NULL,
  job_title_filter    text        DEFAULT NULL,
  tag_filter          text        DEFAULT NULL,
  date_from           timestamptz DEFAULT NULL,
  sort_field          text        DEFAULT 'name',
  sort_direction      text        DEFAULT 'asc',
  page_size           integer     DEFAULT 50,
  page_offset         integer     DEFAULT 0
)
RETURNS TABLE(
  id           uuid,
  name         text,
  nickname     text,
  surname      text,
  job_title    text,
  company      text,
  phone        text,
  email        text,
  avatar_url   text,
  tags         text[],
  notes        text,
  contact_type text,
  created_at   timestamptz,
  updated_at   timestamptz,
  total_count  bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_search text;
BEGIN
  v_search := NULLIF(TRIM(search_term), '');

  RETURN QUERY
  SELECT
    c.id, c.name, c.nickname, c.surname, c.job_title, c.company,
    c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type,
    c.created_at, c.updated_at,
    -- Único scan: COUNT via window function elimina o SELECT separado
    COUNT(*) OVER () AS total_count
  FROM public.contacts c
  WHERE
    -- ILIKE aproveita índices GIN trgm para buscas >= 3 caracteres
    (v_search IS NULL OR (
      c.name      ILIKE '%' || v_search || '%' OR
      c.nickname  ILIKE '%' || v_search || '%' OR
      c.surname   ILIKE '%' || v_search || '%' OR
      c.phone     ILIKE '%' || v_search || '%' OR
      c.email     ILIKE '%' || v_search || '%' OR
      c.company   ILIKE '%' || v_search || '%' OR
      c.job_title ILIKE '%' || v_search || '%'
    ))
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter      IS NULL OR c.company       = company_filter)
    AND (job_title_filter    IS NULL OR c.job_title     = job_title_filter)
    AND (tag_filter          IS NULL OR tag_filter       = ANY(c.tags))
    AND (date_from           IS NULL OR c.created_at   >= date_from)
  ORDER BY
    CASE WHEN sort_field = 'name'       AND sort_direction = 'asc'  THEN c.name       END ASC  NULLS LAST,
    CASE WHEN sort_field = 'name'       AND sort_direction = 'desc' THEN c.name       END DESC NULLS LAST,
    CASE WHEN sort_field = 'created_at' AND sort_direction = 'asc'  THEN c.created_at END ASC  NULLS LAST,
    CASE WHEN sort_field = 'created_at' AND sort_direction = 'desc' THEN c.created_at END DESC NULLS LAST,
    CASE WHEN sort_field = 'updated_at' AND sort_direction = 'desc' THEN c.updated_at END DESC NULLS LAST,
    c.name ASC NULLS LAST
  LIMIT  page_size
  OFFSET page_offset;
END;
$$;
