-- E54 + fix crítico de segurança em search_contacts
--
-- 1. FIX CRÍTICO (P0): search_contacts ainda usava "OR assigned_to IS NULL"
--    que bypassa o RLS via SECURITY DEFINER, desfazendo completamente o E23.
--    Substituído por EXISTS(queue_members) alinhado à contacts_select_policy.
--
-- 2. E54: drop de 7 índices com 0 scans (6 trigram + btree de feature inativa):
--    - idx_contacts_name_trgm     (592 kB, 0 scans) — seqscan vence em 1105 rows
--    - idx_contacts_phone_trgm    (440 kB, 0 scans)
--    - idx_contacts_nickname_trgm  (48 kB, 0 scans)
--    - idx_contacts_surname_trgm   (48 kB, 0 scans)
--    - idx_contacts_company_trgm   (48 kB, 0 scans)
--    - idx_contacts_job_title_trgm (48 kB, 0 scans)
--    - idx_contacts_channel_connection_id (32 kB, 0 scans, feature channel inativa)
--    idx_contacts_email_trgm mantido (85 scans confirmados).
--    Total recuperado: ~1.256 kB.
--
-- Aplicado em 2026-09-02 via db_transaction (direto em produção).

-- 1. Corrige search_contacts: remove furo RLS, usa queue_members
CREATE OR REPLACE FUNCTION public.search_contacts(
  search_term        text    DEFAULT ''::text,
  contact_type_filter text   DEFAULT NULL::text,
  company_filter     text    DEFAULT NULL::text,
  job_title_filter   text    DEFAULT NULL::text,
  tag_filter         text    DEFAULT NULL::text,
  date_from          timestamptz DEFAULT NULL,
  sort_field         text    DEFAULT 'name'::text,
  sort_direction     text    DEFAULT 'asc'::text,
  page_size          integer DEFAULT 50,
  page_offset        integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, name text, nickname text, surname text, job_title text,
  company text, phone text, email text, avatar_url text, tags text[],
  notes text, contact_type text,
  created_at timestamptz, updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_search text;
BEGIN
  v_search := NULLIF(TRIM(search_term), '');

  RETURN QUERY
  SELECT
    c.id, c.name, c.nickname, c.surname, c.job_title, c.company,
    c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type,
    c.created_at, c.updated_at,
    COUNT(*) OVER () AS total_count
  FROM public.contacts c
  WHERE
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
    -- Alinhado à contacts_select_policy (E23): queue membership em vez de IS NULL
    AND (
      is_admin_or_supervisor(auth.uid())
      OR c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
      OR EXISTS (
        SELECT 1 FROM public.queue_members qm
        WHERE qm.queue_id = c.queue_id
          AND qm.profile_id = get_profile_id_for_user(auth.uid())
          AND qm.is_active = true
      )
    )
  ORDER BY
    CASE WHEN sort_field='name'       AND sort_direction='asc'  THEN c.name       END ASC  NULLS LAST,
    CASE WHEN sort_field='name'       AND sort_direction='desc' THEN c.name       END DESC NULLS LAST,
    CASE WHEN sort_field='created_at' AND sort_direction='asc'  THEN c.created_at END ASC  NULLS LAST,
    CASE WHEN sort_field='created_at' AND sort_direction='desc' THEN c.created_at END DESC NULLS LAST,
    CASE WHEN sort_field='updated_at' AND sort_direction='asc'  THEN c.updated_at END ASC  NULLS LAST,
    CASE WHEN sort_field='updated_at' AND sort_direction='desc' THEN c.updated_at END DESC NULLS LAST,
    c.name ASC NULLS LAST
  LIMIT  page_size
  OFFSET page_offset;
END;
$function$;

-- 2. Drop índices com 0 scans (E54)
DROP INDEX IF EXISTS public.idx_contacts_name_trgm;
DROP INDEX IF EXISTS public.idx_contacts_nickname_trgm;
DROP INDEX IF EXISTS public.idx_contacts_surname_trgm;
DROP INDEX IF EXISTS public.idx_contacts_phone_trgm;
DROP INDEX IF EXISTS public.idx_contacts_company_trgm;
DROP INDEX IF EXISTS public.idx_contacts_job_title_trgm;
-- idx_contacts_channel_connection_id: FK-backing index (FK ON DELETE SET NULL);
-- 0 scans em queries não significa que pode ser dropado — PostgreSQL usa este índice
-- para enforcer a FK em DELETE/UPDATE de channel_connections. Mantido.
-- Recriado caso tenha sido dropado acidentalmente:
CREATE INDEX IF NOT EXISTS idx_contacts_channel_connection_id ON public.contacts(channel_connection_id);
