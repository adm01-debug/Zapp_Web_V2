-- GERADO por build_defs.py -- NAO EDITAR A MAO.
-- Corpos extraidos literalmente das migrations (ver FUNCS em build_defs.py).

-- >>> is_admin_or_supervisor  <- supabase/migrations/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;;

-- >>> get_profile_id_for_user  <- supabase/migrations/20260909200000_harden_inbox_contact_authorization.sql
CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT profile.id
  FROM public.profiles AS profile
  WHERE _user_id = auth.uid()
    AND profile.user_id = _user_id
  LIMIT 1;
$$;;

-- >>> get_visible_agent_ids  <- supabase/migrations/20260909200000_harden_inbox_contact_authorization.sql
CREATE OR REPLACE FUNCTION public.get_visible_agent_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT profile.id
  FROM public.profiles AS profile
  WHERE _user_id = auth.uid()
    AND profile.user_id = _user_id
  UNION
  SELECT visibility.can_see_agent_id
  FROM public.agent_visibility_grants AS visibility
  JOIN public.profiles AS viewer ON viewer.id = visibility.agent_id
  WHERE _user_id = auth.uid()
    AND viewer.user_id = _user_id
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS role_assignment
      WHERE role_assignment.user_id = _user_id
        AND role_assignment.role = 'special_agent'
    );
$$;;

-- >>> can_edit_contact  <- supabase/migrations/20260929810000_contacts_can_edit_contact_hoisted_params.sql
CREATE OR REPLACE FUNCTION public.can_edit_contact(
  p_assigned_to uuid,
  p_queue_id uuid,
  p_visible_agent_ids uuid[],
  p_profile_id uuid,
  p_is_admin boolean
) RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- COALESCE no resultado: `x = ANY(NULL)` devolve NULL (o `x IN (SELECT ... vazio)` devolvia
  -- false), e o chamador tem que receber boolean limpo -- sem isto a UI trata "sem vinculo"
  -- como "sem resposta" e mantem o item "Excluir" visivel.
  SELECT COALESCE(
    COALESCE(p_is_admin, public.is_admin_or_supervisor(auth.uid()))
    OR p_assigned_to = ANY (COALESCE(p_visible_agent_ids, (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v)))
    OR EXISTS (
         SELECT 1
         FROM public.queue_members qm
         WHERE qm.queue_id = p_queue_id
           AND qm.profile_id = COALESCE(p_profile_id, public.get_profile_id_for_user(auth.uid()))
           AND qm.is_active = true
       ),
    false)
$function$;;

-- >>> can_edit_contact  <- supabase/migrations/20260929810000_contacts_can_edit_contact_hoisted_params.sql
CREATE OR REPLACE FUNCTION public.can_edit_contact(p_assigned_to uuid, p_queue_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.can_edit_contact(p_assigned_to, p_queue_id, NULL::uuid[], NULL::uuid, NULL::boolean)
$function$;;

-- >>> search_contacts  <- supabase/migrations/20260929810000_contacts_can_edit_contact_hoisted_params.sql
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
$function$;;

-- >>> arquivo inteiro <- supabase/migrations/20260929150000_contact_address_audit_trigger.sql
-- Fase 1 (E06) — trilha de auditoria das mudanças de endereço em `contacts`.
--
-- Serve para detectar regressão do C1 (E96): se uma edição de contato voltar a apagar
-- endereço sem intenção, o evento `contact_address_changed` com `cleared=true` aparece
-- em `audit_logs`. Sem PII no `details` — só o `contact_id` e o booleano `cleared`
-- (mesmo padrão de `audit_role_changes`), nunca o endereço em si.
CREATE OR REPLACE FUNCTION public.audit_contact_address_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- `AFTER UPDATE OF <colunas>` já limita o disparo às colunas de endereço; este teste
  -- garante que só registra quando o valor REALMENTE mudou.
  IF OLD.address         IS DISTINCT FROM NEW.address
     OR OLD.address_number IS DISTINCT FROM NEW.address_number
     OR OLD.neighborhood   IS DISTINCT FROM NEW.neighborhood
     OR OLD.city           IS DISTINCT FROM NEW.city
     OR OLD.state          IS DISTINCT FROM NEW.state
     OR OLD.postal_code    IS DISTINCT FROM NEW.postal_code
     OR OLD.latitude       IS DISTINCT FROM NEW.latitude
     OR OLD.longitude      IS DISTINCT FROM NEW.longitude
  THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'contact_address_changed',
      'contacts',
      NEW.id,
      jsonb_build_object(
        'contact_id', NEW.id,
        -- "cleared" = endereço e coordenada ficaram vazios no mesmo UPDATE
        'cleared', (NEW.address IS NULL AND NEW.city IS NULL
                    AND NEW.latitude IS NULL AND NEW.longitude IS NULL)
      )
    );
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_contact_address_change ON public.contacts;

CREATE TRIGGER trg_audit_contact_address_change
AFTER UPDATE OF address, address_number, neighborhood, city, state, postal_code, latitude, longitude
ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.audit_contact_address_change();

-- >>> policies de RLS de contacts <- supabase/migrations/20260929810000_contacts_can_edit_contact_hoisted_params.sql
DROP POLICY IF EXISTS "Users can update their assigned contacts" ON public.contacts;
CREATE POLICY "Users can update their assigned contacts" ON public.contacts
  FOR UPDATE
  TO authenticated
  USING (public.can_edit_contact(assigned_to, queue_id,
           (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
           (SELECT public.get_profile_id_for_user(auth.uid())),
           (SELECT public.is_admin_or_supervisor(auth.uid()))));

-- 2) Policy de SELECT ------------------------------------------------------------------------
DROP POLICY IF EXISTS "contacts_select_policy" ON public.contacts;
CREATE POLICY "contacts_select_policy" ON public.contacts
  FOR SELECT
  TO authenticated
  USING (public.can_edit_contact(assigned_to, queue_id,
           (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
           (SELECT public.get_profile_id_for_user(auth.uid())),
           (SELECT public.is_admin_or_supervisor(auth.uid()))));
