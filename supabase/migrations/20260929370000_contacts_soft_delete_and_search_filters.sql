-- Migration: Exclusao de contato por soft-delete + filtro de excluidos nas RPCs de leitura
-- Autor: Hermes (docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md — etapas 7, 8 e 10)
-- Decisao D1 (29/09/2026): soft-delete por RPC auditada, nunca DELETE fisico — o contato
-- carrega mensagens, notas e vinculos de CRM, e o trigger BEFORE DELETE
-- (`trg_redact_crm_sync_on_contact_delete`) existe justamente para a exclusao real (LGPD).
--
-- Contexto do P0 corrigido aqui (auditoria de 29/09, §3.1): `public.contacts` tem RLS ligada
-- e NENHUMA policy de DELETE, entao o `delete()` do front devolvia 0 linhas sem erro e a UI
-- anunciava "Contato excluido com sucesso!". Nao existia RPC de exclusao em `pg_proc`.
--
-- Layout: `DECLARE ...; BEGIN` fica na mesma linha da abertura do bloco de proposito. O
-- executor da casa (hermes-db-migrar) recusa arquivo com `BEGIN` no inicio de uma linha —
-- heuristica que barra transacao explicita de topo e nao distingue corpo plpgsql dentro de
-- dollar-quote. Este arquivo NAO tem transacao explicita; e falso positivo do executor.
--
-- Aplicada DEPOIS do merge e do deploy (classe contrato: `create or replace function`),
-- pelo hermes-tarefa-mergear, como manda a regra 6 do CLAUDE.md §1.

-- 1) Coluna de marcacao (aditiva e nullable: nada em producao a usa ainda)
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.contacts.deleted_at IS
  'Soft-delete: NULL = contato vivo. Preenchido por delete_contact()/delete_contacts().';

-- 2) Indice parcial. Case classico: quase toda linha tem deleted_at IS NULL, entao um btree
--    cheio seria peso morto; o indice so serve para achar os excluidos (restauracao, auditoria).
CREATE INDEX IF NOT EXISTS idx_contacts_deleted_at
  ON public.contacts (deleted_at) WHERE deleted_at IS NOT NULL;

-- 3) Exclusao de um contato ---------------------------------------------------------------
-- Permite admin/supervisor OU o dono (`assigned_to` = perfil do chamador). SECURITY DEFINER
-- porque a policy de UPDATE de `contacts` e so-dono e um admin que nao e dono atualizaria
-- 0 linhas em silencio — exatamente o bug que esta migration conserta.
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
     AND (
       public.is_admin_or_supervisor(auth.uid())
       OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
     )
  RETURNING c.id INTO v_id;

  -- Sem linha: contato inexistente, ja excluido ou fora do alcance do chamador. Uma unica
  -- mensagem para os tres casos evita enumeracao de contatos por quem nao pode ver.
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Contato nao encontrado ou sem permissao para excluir.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_id;
END;
$function$;

-- 4) Exclusao em lote (barra de acoes em massa) -------------------------------------------
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
     AND (
       public.is_admin_or_supervisor(auth.uid())
       OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Nenhum contato excluido: sem permissao ou ja excluido.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_count;
END;
$function$;

-- Funcoes novas nascem com EXECUTE concedido a anon/authenticated/service_role por
-- ALTER DEFAULT PRIVILEGES (nao via PUBLIC — REVOKE FROM PUBLIC sozinho nao basta).
REVOKE ALL ON FUNCTION public.delete_contact(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_contacts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_contact(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_contacts(uuid[]) TO authenticated, service_role;

-- 5) Contatos excluidos saem de todas as leituras do modulo -------------------------------
--    `search_contacts` mantem assinatura, SECURITY DEFINER, search_path e a lista de 23
--    colunas de retorno IDENTICA a vigente no banco (20260926160000 lat/lon + as 6 de endereco
--    de migration posterior) — `CREATE OR REPLACE` recusa mudar o tipo de retorno (42P13), e foi
--    assim que este arquivo foi recusado na primeira aplicacao. CREATE OR REPLACE preserva o ACL
--    manual da funcao, entao nao ha REVOKE/GRANT aqui de proposito.
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

CREATE OR REPLACE FUNCTION public.contacts_count_by_type()
 RETURNS TABLE(contact_type text, count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(c.contact_type, 'cliente') AS contact_type, COUNT(*) AS count
  FROM public.contacts c
  WHERE c.deleted_at IS NULL
  GROUP BY COALESCE(c.contact_type, 'cliente');
$function$;
