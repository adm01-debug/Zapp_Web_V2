-- Esqueleto MINIMO derivado das migrations reais do Zapp Web V2, so o necessario
-- para aplicar a migration REAL 20260930450000 (search_contacts + contacts_count_by_type).
-- NAO e a cadeia completa de migrations: e uma replica fiel dos objetos que as duas
-- funcoes tocam. Os helpers abaixo sao COPIADOS dos arquivos versionados (mesma assinatura
-- e mesmo corpo), nao reescritos.

create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable as $$ select '11111111-0000-4000-8000-000000000001'::uuid $$;

do $do$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$do$;

create table public.profiles (id uuid primary key, user_id uuid);
create table public.user_roles (user_id uuid, role text);
create table public.agent_visibility_grants (agent_id uuid, can_see_agent_id uuid);
create table public.queue_members (queue_id uuid, profile_id uuid, is_active boolean);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text, nickname text, surname text, job_title text, company text,
  phone text, email text, avatar_url text, tags text[], notes text,
  contact_type text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  latitude double precision, longitude double precision,
  address text, address_number text, neighborhood text, city text, state text,
  postal_code text,
  is_lid_legacy boolean default false,
  deleted_at timestamptz,
  assigned_to uuid,
  queue_id uuid
);

-- Indices do canonico que pesam nesta consulta (nome de origem: "indices de contacts",
-- docs/audits/adversarial-f1-f2-f3-onda2-2026-09-29/provas/w4/tabelas.md).
create index idx_contacts_name_asc on public.contacts (name);
create index idx_contacts_created_at on public.contacts (created_at);
create index idx_contacts_updated_at on public.contacts (updated_at);
create index idx_contacts_deleted_at on public.contacts (deleted_at);
create index idx_contacts_is_lid_legacy on public.contacts (is_lid_legacy);
create index idx_contacts_contact_type on public.contacts (contact_type);
create index idx_contacts_company on public.contacts (company);

-- 4 helpers copiados literalmente das migrations versionadas.
-- origens: 20260909200000_harden_inbox_contact_authorization.sql (2 primeiros),
--          20251215025014 (is_admin_or_supervisor),
--          20260929810000_contacts_can_edit_contact_hoisted_params.sql (can_edit_contact).

CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT profile.id
  FROM public.profiles AS profile
  WHERE _user_id = auth.uid()
    AND profile.user_id = _user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_visible_agent_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
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
$$;

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
$$;

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
$function$;
