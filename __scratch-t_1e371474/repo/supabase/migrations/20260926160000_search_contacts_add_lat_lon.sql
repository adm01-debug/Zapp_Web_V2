-- Fase 6 follow-up (E43): expõe latitude/longitude no RPC search_contacts
-- para os pinos verdes do mapa de contatos (PR #850) receberem coordenada real.
-- Mesmo filtro RLS de antes (is_admin_or_supervisor / assigned_to / queue_members),
-- só adiciona 2 colunas já visíveis a quem pode ver o contato.
--
-- Aplicada em produção via MCP correto (SUPABASE - ZAPP WEB V2 - MCP) antes desta PR,
-- seguindo o mesmo padrão da migration contacts_latitude_longitude (PR #850).
DROP FUNCTION IF EXISTS public.search_contacts(text, text, text, text, text, timestamp with time zone, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_search text;
BEGIN
  v_search := NULLIF(TRIM(search_term), '');
  RETURN QUERY
  SELECT
    c.id, c.name, c.nickname, c.surname, c.job_title, c.company,
    c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type,
    c.created_at, c.updated_at, c.latitude, c.longitude,
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
    AND (company_filter       IS NULL OR c.company      = company_filter)
    AND (job_title_filter     IS NULL OR c.job_title    = job_title_filter)
    AND (tag_filter           IS NULL OR tag_filter = ANY(c.tags))
    AND (date_from            IS NULL OR c.created_at  >= date_from)
    AND (
      is_admin_or_supervisor(auth.uid())
      OR c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
      OR EXISTS (
        SELECT 1 FROM public.queue_members qm
        WHERE qm.queue_id   = c.queue_id
          AND qm.profile_id = get_profile_id_for_user(auth.uid())
          AND qm.is_active  = true
      )
    )
  ORDER BY
    CASE WHEN sort_field='name'       AND sort_direction='asc'  THEN c.name       END ASC  NULLS LAST,
    CASE WHEN sort_field='name'       AND sort_direction='desc' THEN c.name       END DESC NULLS LAST,
    CASE WHEN sort_field='created_at' AND sort_direction='asc'  THEN c.created_at END ASC  NULLS LAST,
    CASE WHEN sort_field='created_at' AND sort_direction='desc' THEN c.created_at END DESC NULLS LAST,
    CASE WHEN sort_field='updated_at' AND sort_direction='asc'  THEN c.updated_at END ASC  NULLS LAST,
    CASE WHEN sort_field='updated_at' AND sort_direction='desc' THEN c.updated_at END DESC NULLS LAST,
    c.name ASC NULLS LAST,
    c.id   ASC
  LIMIT page_size OFFSET page_offset;
END;
$function$;

-- DROP FUNCTION zera o ACL. ALTER DEFAULT PRIVILEGES concede EXECUTE direto a
-- anon/authenticated/service_role em toda funcao NOVA do owner postgres (nao via
-- PUBLIC — REVOKE FROM PUBLIC sozinho nao cobre isso; ver 20260926152000, que
-- corrige o mesmo padrao). REVOKE explicito de anon abaixo, alem do de PUBLIC —
-- restaura exatamente o grant original (sem PUBLIC/anon).
GRANT EXECUTE ON FUNCTION public.search_contacts(text, text, text, text, text, timestamp with time zone, text, text, integer, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.search_contacts(text, text, text, text, text, timestamp with time zone, text, text, integer, integer) FROM PUBLIC, anon;
