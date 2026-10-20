-- =============================================================================
-- W4 -- VARIANTES do RPC `search_contacts` para o experimento (schema public,
-- nomes w4_* para nao colidir com o RPC real, que fica intacto).
-- =============================================================================
-- v0_vigente  = PUBLIC.search_contacts (o proprio, de 20260929810000). NAO ha
--               copia: o bench chama a funcao real.
-- v1_inline   = MESMO corpo do vigente, mas com o predicado de visibilidade
--               INLINE (forma anterior ao 20260929810000: is_admin_or_supervisor/
--               get_visible_agent_ids/get_profile_id_for_user direto no WHERE,
--               sem a chamada por linha a can_edit_contact). Isola o custo da
--               funcao SECURITY DEFINER avaliada por linha.
-- v2_branches = predicado do vigente (can_edit_contact por linha, com os lookups
--               ja hoisted em variaveis) + ORDER BY SEM a cadeia de CASE:
--               IF sort_field=... com queries separadas (a reescrita que o
--               F-04 da onda 1 pediu). Mantem COUNT(*) OVER ().
-- v3_nocount  = v2 + total_count vindo de um SELECT count(*) separado, para que a
--               pagina possa ser resolvida por varredura de indice ja ordenada +
--               LIMIT (o OVER () obriga a consumir o conjunto inteiro antes de
--               emitir a primeira linha).
-- =============================================================================
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------- v1_inline --
CREATE OR REPLACE FUNCTION public.w4_v1_inline(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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

-- =============================== v2_branches / v3_nocount ====================
-- Bloco do predicado (identico ao vigente, com os lookups hoisted em variaveis):
--   c.deleted_at IS NULL
--   AND (v_search IS NULL OR (7 ILIKE sobre name/nickname/surname/phone/email/company/job_title))
--   AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
--   AND (company_filter IS NULL OR c.company = company_filter)
--   AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
--   AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
--   AND (date_from IS NULL OR c.created_at >= date_from)
--   AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.w4_v2_branches(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE
  v_search text; v_vis uuid[]; v_prof uuid; v_admin boolean;
BEGIN
  v_search := NULLIF(TRIM(search_term), '');
  v_vis    := (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v);
  v_prof   := public.get_profile_id_for_user(auth.uid());
  v_admin  := public.is_admin_or_supervisor(auth.uid());

  IF sort_field = 'created_at' AND sort_direction = 'desc' THEN
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, COUNT(*) OVER () AS total_count
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.created_at DESC NULLS LAST, c.name ASC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  ELSIF sort_field = 'created_at' AND sort_direction = 'asc' THEN
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, COUNT(*) OVER () AS total_count
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.created_at ASC NULLS LAST, c.name ASC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  ELSIF sort_field = 'updated_at' AND sort_direction = 'desc' THEN
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, COUNT(*) OVER () AS total_count
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.updated_at DESC NULLS LAST, c.name ASC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  ELSIF sort_field = 'updated_at' AND sort_direction = 'asc' THEN
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, COUNT(*) OVER () AS total_count
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.updated_at ASC NULLS LAST, c.name ASC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  ELSIF sort_field = 'company' AND sort_direction = 'desc' THEN
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, COUNT(*) OVER () AS total_count
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.company DESC NULLS LAST, c.name ASC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  ELSIF sort_field = 'company' AND sort_direction = 'asc' THEN
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, COUNT(*) OVER () AS total_count
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.company ASC NULLS LAST, c.name ASC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  ELSIF sort_field = 'name' AND sort_direction = 'desc' THEN
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, COUNT(*) OVER () AS total_count
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.name DESC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  ELSE
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, COUNT(*) OVER () AS total_count
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.name ASC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  END IF;
END;
$function$;

-- ------------------------------------------------------------- v3_nocount --
-- Identico a v2, mas o total vem de um count(*) separado (sem OVER ()), para a
-- pagina poder sair de varredura de indice ja ordenada + LIMIT.
CREATE OR REPLACE FUNCTION public.w4_v3_nocount(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE
  v_search text; v_vis uuid[]; v_prof uuid; v_admin boolean; v_total bigint;
BEGIN
  v_search := NULLIF(TRIM(search_term), '');
  v_vis    := (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v);
  v_prof   := public.get_profile_id_for_user(auth.uid());
  v_admin  := public.is_admin_or_supervisor(auth.uid());

  SELECT count(*) INTO v_total
  FROM public.contacts c
  WHERE c.deleted_at IS NULL
    AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter IS NULL OR c.company = company_filter)
    AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
    AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
    AND (date_from IS NULL OR c.created_at >= date_from)
    AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin);

  IF sort_field = 'created_at' AND sort_direction = 'desc' THEN
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, v_total
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.created_at DESC NULLS LAST, c.name ASC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  ELSIF sort_field = 'created_at' AND sort_direction = 'asc' THEN
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, v_total
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.created_at ASC NULLS LAST, c.name ASC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  ELSIF sort_field = 'updated_at' AND sort_direction = 'desc' THEN
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, v_total
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.updated_at DESC NULLS LAST, c.name ASC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  ELSIF sort_field = 'updated_at' AND sort_direction = 'asc' THEN
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, v_total
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.updated_at ASC NULLS LAST, c.name ASC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  ELSIF sort_field = 'company' AND sort_direction = 'desc' THEN
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, v_total
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.company DESC NULLS LAST, c.name ASC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  ELSIF sort_field = 'company' AND sort_direction = 'asc' THEN
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, v_total
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.company ASC NULLS LAST, c.name ASC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  ELSIF sort_field = 'name' AND sort_direction = 'desc' THEN
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, v_total
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.name DESC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  ELSE
    RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, v_total
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR (c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR c.surname ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%' OR c.email ILIKE '%'||v_search||'%' OR c.company ILIKE '%'||v_search||'%' OR c.job_title ILIKE '%'||v_search||'%'))
      AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
      AND (company_filter IS NULL OR c.company = company_filter)
      AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
      AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
      AND (date_from IS NULL OR c.created_at >= date_from)
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_vis, v_prof, v_admin)
    ORDER BY c.name ASC NULLS LAST, c.id ASC
    LIMIT page_size OFFSET page_offset;
  END IF;
END;
$function$;
