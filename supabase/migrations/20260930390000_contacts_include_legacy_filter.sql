-- Migration: Contatos legados fora da lista por padrao (include_legacy)
-- Plano: docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md — F5, etapa 51 (decisao D4).
--
-- Criterio de "contato visivel em Contatos": is_lid_legacy = false E telefone numerico de
-- 10 a 15 digitos. Sem ele, a aba "Todos" contava contatos de LID legado e telefones
-- sinteticos que nao sao conversaveis (auditoria de 29/09, §1).
--
-- `search_contacts` e `contacts_count_by_type` ganham `include_legacy boolean DEFAULT false`
-- como ULTIMO parametro. Adicionar parametro muda a assinatura, e CREATE OR REPLACE criaria
-- um overload: o PostgREST recusa a chamada sem o parametro novo (PGRST203, candidatos
-- ambiguos). Por isso DROP + CREATE, na mesma transacao, e o ACL reaplicado.
--
-- Compativel com o front atual de `main`: quem chama sem `include_legacy` cai no default.
-- Aplicar DEPOIS do merge e do deploy (classe contrato: DROP de funcao usada pelo front),
-- pela regra 6 do CLAUDE.md §1.
--
-- Layout: `DECLARE ...; BEGIN` na mesma linha da abertura do bloco (heuristica do
-- hermes-db-migrar que barra BEGIN no inicio de linha). Sem transacao explicita.

DROP FUNCTION IF EXISTS public.search_contacts(text, text, text, text, text, timestamptz, text, text, integer, integer);

CREATE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0, include_legacy boolean DEFAULT false)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_search text; BEGIN
  v_search := NULLIF(TRIM(search_term), '');
  RETURN QUERY
  SELECT
    c.id, c.name, c.nickname, c.surname, c.job_title, c.company,
    c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type,
    c.created_at, c.updated_at, c.latitude, c.longitude,
    c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code,
    COUNT(*) OVER () AS total_count
  FROM public.contacts c
  WHERE
    c.deleted_at IS NULL
    AND (include_legacy OR (c.is_lid_legacy = false AND c.phone ~ '^[0-9]{10,15}$'))
    AND (v_search IS NULL OR (
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
    AND public.can_edit_contact(c.assigned_to, c.queue_id,
              (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
              (SELECT public.get_profile_id_for_user(auth.uid())),
              (SELECT public.is_admin_or_supervisor(auth.uid())))
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

-- Funcoes novas recebem EXECUTE de anon por ALTER DEFAULT PRIVILEGES (nao via PUBLIC).
REVOKE ALL ON FUNCTION public.search_contacts(text, text, text, text, text, timestamptz, text, text, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_contacts(text, text, text, text, text, timestamptz, text, text, integer, integer, boolean) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.contacts_count_by_type();

CREATE FUNCTION public.contacts_count_by_type(include_legacy boolean DEFAULT false)
 RETURNS TABLE(contact_type text, count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(c.contact_type, 'cliente') AS contact_type, COUNT(*) AS count
  FROM public.contacts c
  WHERE c.deleted_at IS NULL
    AND (include_legacy OR (c.is_lid_legacy = false AND c.phone ~ '^[0-9]{10,15}$'))
  GROUP BY COALESCE(c.contact_type, 'cliente');
$function$;

REVOKE ALL ON FUNCTION public.contacts_count_by_type(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contacts_count_by_type(boolean) TO authenticated, service_role;
