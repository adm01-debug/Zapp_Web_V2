-- ============================================================================
-- Contatos -- debito pos-#1187 (item 2), parte 2/2: um predicado so, em todos
-- os pontos que decidem permissao
-- ============================================================================
-- Reaponta para public.can_edit_contact (criada em 20260929770000):
--   1. policy de UPDATE "Users can update their assigned contacts"
--   2. policy de SELECT "contacts_select_policy"
--   3. corpo de public.search_contacts
--   4. corpos de public.delete_contact / public.delete_contacts
--
-- Sem mudanca de comportamento: as quatro usavam o mesmo conjunto de condicoes
-- (admin/supervisor OR assigned_to visivel OR membro ativo da fila do contato).
-- A partir daqui, mudar a regra = mudar UMA funcao.
--
-- Classe CONTRATO (policies + CREATE OR REPLACE de funcao): aplicada pos-merge
-- e deploy pelo hermes-tarefa-mergear.
--
-- ATENCAO reviewer: o predicado agora chama uma funcao SECURITY DEFINER no USING
-- das policies. Isso e deliberado (mesma decisao do #1187, onde as RPCs viraram
-- SECURITY DEFINER). Medicao de custo/beneficio no PR.

-- 1) Policy de UPDATE ------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their assigned contacts" ON public.contacts;
CREATE POLICY "Users can update their assigned contacts" ON public.contacts
  FOR UPDATE
  TO authenticated
  USING (public.can_edit_contact(assigned_to, queue_id));

-- 2) Policy de SELECT ------------------------------------------------------------------------
DROP POLICY IF EXISTS "contacts_select_policy" ON public.contacts;
CREATE POLICY "contacts_select_policy" ON public.contacts
  FOR SELECT
  TO authenticated
  USING (public.can_edit_contact(assigned_to, queue_id));

-- 3) search_contacts -- mesma assinatura/RETURNS/SECURITY DEFINER/search_path do vigente
--    (logo CREATE OR REPLACE preserva ACL). Retorna as MESMAS 23 colunas.
CREATE OR REPLACE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
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
    AND public.can_edit_contact(c.assigned_to, c.queue_id)
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

-- 4) RPCs de exclusao -- mesma assinatura/RETURNS/SECURITY DEFINER/search_path do vigente.
--    Layout `DECLARE ...; BEGIN` na mesma linha: a heuristica do hermes-db-migrar que barra
--    "transacao explicita de topo" casa tambem com o BEGIN de corpo plpgsql em dollar-quote.
CREATE OR REPLACE FUNCTION public.delete_contact(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_id uuid; BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem sessao autenticada.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.contacts c
     SET deleted_at = now()
   WHERE c.id = p_id
     AND c.deleted_at IS NULL
     AND public.can_edit_contact(c.assigned_to, c.queue_id)
  RETURNING c.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Contato nao encontrado ou sem permissao para excluir.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_contacts(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_count integer; BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem sessao autenticada.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.contacts c
     SET deleted_at = now()
   WHERE c.id = ANY(p_ids)
     AND c.deleted_at IS NULL
     AND public.can_edit_contact(c.assigned_to, c.queue_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Nenhum contato excluido: sem permissao ou ja excluido.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_count;
END;
$function$;
