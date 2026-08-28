-- Migration: 20260827160000_scope_search_contacts_to_rls_m01
-- M-01: alinha search_contacts a contacts_select_policy (RLS da tabela contacts).
--
-- Problema: search_contacts e SECURITY DEFINER e nao aplicava RLS, entao todos os
-- agentes viam TODOS os contatos na busca, mesmo os atribuidos a outro agente --
-- divergindo da propria policy de SELECT da tabela.
--
-- Correcao: replica no WHERE o MESMO predicado da contacts_select_policy.
--   admin/supervisor -> ve tudo
--   agente           -> ve os atribuidos a si + os nao-atribuidos (assigned_to IS NULL)
--
-- Impacto: NO-OP com os dados atuais (todos os contatos estao nao-atribuidos, entao
-- o agente continua vendo todos). O filtro so passa a morder quando houver atribuicao.
-- SECURITY DEFINER e mantido de proposito por performance (COUNT(*) OVER() em scan unico);
-- a RLS deixa de ser furada porque o predicado da policy esta replicado aqui.

CREATE OR REPLACE FUNCTION public.search_contacts(
  search_term text DEFAULT ''::text,
  contact_type_filter text DEFAULT NULL::text,
  company_filter text DEFAULT NULL::text,
  job_title_filter text DEFAULT NULL::text,
  tag_filter text DEFAULT NULL::text,
  date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  sort_field text DEFAULT 'name'::text,
  sort_direction text DEFAULT 'asc'::text,
  page_size integer DEFAULT 50,
  page_offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_search text;
BEGIN
  -- Visibilidade alinhada a contacts_select_policy (RLS da tabela contacts):
  -- admin/supervisor veem tudo; agente ve os atribuidos a si + os nao-atribuidos.
  -- SECURITY DEFINER e mantido por performance (COUNT(*) OVER() em scan unico),
  -- mas o MESMO predicado da policy e replicado no WHERE para nao furar a RLS.
  v_search := NULLIF(TRIM(search_term), '');

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.nickname,
    c.surname,
    c.job_title,
    c.company,
    c.phone,
    c.email,
    c.avatar_url,
    c.tags,
    c.notes,
    c.contact_type,
    c.created_at,
    c.updated_at,
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
    AND (
      is_admin_or_supervisor(auth.uid())
      OR c.assigned_to = get_profile_id_for_user(auth.uid())
      OR c.assigned_to IS NULL
    )
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
$function$;