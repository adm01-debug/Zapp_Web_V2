
-- Enable trigram extension for fast ILIKE searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN trigram indexes on searchable contact fields
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON public.contacts USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_trgm ON public.contacts USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_email_trgm ON public.contacts USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_company_trgm ON public.contacts USING gin (company gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_nickname_trgm ON public.contacts USING gin (nickname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_surname_trgm ON public.contacts USING gin (surname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_job_title_trgm ON public.contacts USING gin (job_title gin_trgm_ops);

-- Index for contact_type filtering
CREATE INDEX IF NOT EXISTS idx_contacts_contact_type ON public.contacts (contact_type);

-- Index for created_at filtering/sorting
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON public.contacts (created_at DESC);

-- Composite index for common sort
CREATE INDEX IF NOT EXISTS idx_contacts_name_asc ON public.contacts (name ASC);

-- Server-side search RPC with pagination
CREATE OR REPLACE FUNCTION public.search_contacts(
  search_term text DEFAULT '',
  contact_type_filter text DEFAULT NULL,
  company_filter text DEFAULT NULL,
  job_title_filter text DEFAULT NULL,
  tag_filter text DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  sort_field text DEFAULT 'name',
  sort_direction text DEFAULT 'asc',
  page_size int DEFAULT 50,
  page_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  nickname text,
  surname text,
  job_title text,
  company text,
  phone text,
  email text,
  avatar_url text,
  tags text[],
  notes text,
  contact_type text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_search text;
BEGIN
  v_search := COALESCE(NULLIF(TRIM(search_term), ''), NULL);
  
  -- Get total count first
  SELECT COUNT(*) INTO v_total
  FROM public.contacts c
  WHERE
    (v_search IS NULL OR (
      c.name ILIKE '%' || v_search || '%' OR
      c.nickname ILIKE '%' || v_search || '%' OR
      c.surname ILIKE '%' || v_search || '%' OR
      c.phone ILIKE '%' || v_search || '%' OR
      c.email ILIKE '%' || v_search || '%' OR
      c.company ILIKE '%' || v_search || '%' OR
      c.job_title ILIKE '%' || v_search || '%'
    ))
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter IS NULL OR c.company = company_filter)
    AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
    AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
    AND (date_from IS NULL OR c.created_at >= date_from);

  RETURN QUERY
  SELECT
    c.id, c.name, c.nickname, c.surname, c.job_title, c.company,
    c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type,
    c.created_at, c.updated_at,
    v_total AS total_count
  FROM public.contacts c
  WHERE
    (v_search IS NULL OR (
      c.name ILIKE '%' || v_search || '%' OR
      c.nickname ILIKE '%' || v_search || '%' OR
      c.surname ILIKE '%' || v_search || '%' OR
      c.phone ILIKE '%' || v_search || '%' OR
      c.email ILIKE '%' || v_search || '%' OR
      c.company ILIKE '%' || v_search || '%' OR
      c.job_title ILIKE '%' || v_search || '%'
    ))
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter IS NULL OR c.company = company_filter)
    AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
    AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
    AND (date_from IS NULL OR c.created_at >= date_from)
  ORDER BY
    CASE WHEN sort_field = 'name' AND sort_direction = 'asc' THEN c.name END ASC,
    CASE WHEN sort_field = 'name' AND sort_direction = 'desc' THEN c.name END DESC,
    CASE WHEN sort_field = 'created_at' AND sort_direction = 'asc' THEN c.created_at END ASC,
    CASE WHEN sort_field = 'created_at' AND sort_direction = 'desc' THEN c.created_at END DESC,
    CASE WHEN sort_field = 'updated_at' AND sort_direction = 'desc' THEN c.updated_at END DESC,
    c.name ASC
  LIMIT page_size
  OFFSET page_offset;
END;
$$;

-- Also create a fast count-by-type function
CREATE OR REPLACE FUNCTION public.contacts_count_by_type()
RETURNS TABLE (contact_type text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(c.contact_type, 'cliente') AS contact_type, COUNT(*) AS count
  FROM public.contacts c
  GROUP BY COALESCE(c.contact_type, 'cliente');
$$;
