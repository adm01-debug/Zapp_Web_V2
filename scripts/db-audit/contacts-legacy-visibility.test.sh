#!/usr/bin/env bash
# Contrato da F5 do plano de Contatos (docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md,
# etapa 51, decisao D4): contato legado (is_lid_legacy) ou com telefone nao numerico fica
# fora de search_contacts/contacts_count_by_type por padrao; include_legacy=true traz de volta.
#
# Roda em PostgreSQL 17 descartavel com o estado vigente das duas RPCs (20260929810000 e
# 20260929370000) e os default privileges do Supabase (EXECUTE para anon em funcao nova).
# Nenhuma credencial de producao entra aqui.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930410000_contacts_include_legacy_filter.sql"
postgres_image="${CONTACTS_F5_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-contacts-f5-test-$$"
tmp_dir="$(mktemp -d /tmp/zapp-v2-contacts-f5-test.XXXXXX)"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-contacts-f5-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    /tmp/zapp-v2-contacts-f5-test.*) rm -rf -- "$tmp_dir" ;;
  esac
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql")"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
-- Default privileges do Supabase: funcao nova nasce executavel por anon/authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  name text, nickname text, surname text, job_title text, company text,
  phone text NOT NULL, email text, avatar_url text, tags text[], notes text,
  contact_type text,
  assigned_to uuid, queue_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision, longitude double precision,
  address text, address_number text, neighborhood text, city text, state text, postal_code text,
  is_lid_legacy boolean NOT NULL DEFAULT false,
  deleted_at timestamptz
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.contacts TO authenticated, service_role;

CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id=_user_id LIMIT 1 $$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id=_user_id $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT _user_id = '20000000-0000-0000-0000-000000000009'::uuid $$;
CREATE FUNCTION public.can_edit_contact(p_assigned_to uuid, p_queue_id uuid, p_visible uuid[], p_profile uuid, p_is_admin boolean)
  RETURNS boolean LANGUAGE sql STABLE SET search_path=public
  AS $$ SELECT coalesce(p_is_admin, false) OR p_assigned_to = ANY(coalesce(p_visible, '{}')) $$;
CREATE POLICY contacts_select_policy ON public.contacts FOR SELECT TO authenticated
  USING (public.can_edit_contact(assigned_to, queue_id,
           (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
           (SELECT public.get_profile_id_for_user(auth.uid())),
           (SELECT public.is_admin_or_supervisor(auth.uid()))));

-- Estado vigente (20260929810000): 10 parametros, 23 colunas, SECURITY DEFINER.
CREATE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE v_search text; BEGIN
  v_search := NULLIF(TRIM(search_term), '');
  RETURN QUERY
  SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company,
         c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type,
         c.created_at, c.updated_at, c.latitude, c.longitude,
         c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code,
         COUNT(*) OVER () AS total_count
  FROM public.contacts c
  WHERE c.deleted_at IS NULL
    AND (v_search IS NULL OR c.name ILIKE '%' || v_search || '%')
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND public.can_edit_contact(c.assigned_to, c.queue_id,
          (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
          (SELECT public.get_profile_id_for_user(auth.uid())),
          (SELECT public.is_admin_or_supervisor(auth.uid())))
  ORDER BY c.name ASC NULLS LAST, c.id ASC
  LIMIT page_size OFFSET page_offset;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer) TO authenticated, service_role;

CREATE FUNCTION public.contacts_count_by_type()
 RETURNS TABLE(contact_type text, count bigint)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT COALESCE(c.contact_type, 'cliente') AS contact_type, COUNT(*) AS count
  FROM public.contacts c
  WHERE c.deleted_at IS NULL
  GROUP BY COALESCE(c.contact_type, 'cliente');
$function$;
REVOKE EXECUTE ON FUNCTION public.contacts_count_by_type() FROM PUBLIC, anon;

INSERT INTO public.profiles VALUES
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000009');

-- 6 contatos: 2 visiveis, 4 escondidos por motivos distintos (um de cada) e 1 excluido.
INSERT INTO public.contacts (id, name, phone, contact_type, assigned_to, is_lid_legacy, deleted_at) VALUES
  ('30000000-0000-0000-0000-000000000001','A visivel cliente','5511900000001','cliente','10000000-0000-0000-0000-000000000001',false,NULL),
  ('30000000-0000-0000-0000-000000000002','B visivel fornecedor','551190000002','fornecedor','10000000-0000-0000-0000-000000000009',false,NULL),
  ('30000000-0000-0000-0000-000000000003','C legado LID','5511900000003','cliente','10000000-0000-0000-0000-000000000001',true,NULL),
  ('30000000-0000-0000-0000-000000000004','D telefone sintetico','120363000000000000@g.us','cliente','10000000-0000-0000-0000-000000000009',false,NULL),
  ('30000000-0000-0000-0000-000000000005','E telefone curto','123456789','fornecedor','10000000-0000-0000-0000-000000000009',false,NULL),
  ('30000000-0000-0000-0000-000000000006','F telefone com mascara','+55 (11) 90000-0006','cliente','10000000-0000-0000-0000-000000000009',false,NULL),
  ('30000000-0000-0000-0000-000000000007','G excluido','5511900000007','cliente','10000000-0000-0000-0000-000000000009',false,now());
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

AGENTE='20000000-0000-0000-0000-000000000001'
ADMIN='20000000-0000-0000-0000-000000000009'
as_admin="SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN';"
as_agente="SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE';"

# ── RED: antes da migration o default lista legados e telefones sinteticos ──────────────
expect_value 'RED: search_contacts() do admin devolve os 6 vivos (inclui legado/sintetico)' '6' \
  "$as_admin SELECT count(*) FROM public.search_contacts()"
expect_value 'RED: contacts_count_by_type() soma os 6 vivos' '6' \
  "$as_admin SELECT sum(count) FROM public.contacts_count_by_type()"

psql_file "$migration" >/dev/null

# ── GREEN: assinatura unica (sem overload ambiguo para o PostgREST) ──────────────────────
expect_value 'search_contacts tem uma unica assinatura, com include_legacy no fim' \
  'search_term text, contact_type_filter text, company_filter text, job_title_filter text, tag_filter text, date_from timestamp with time zone, sort_field text, sort_direction text, page_size integer, page_offset integer, include_legacy boolean' \
  "SELECT string_agg(pg_get_function_identity_arguments(p.oid), ' | ') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='search_contacts'"
expect_value 'contacts_count_by_type tem uma unica assinatura (include_legacy boolean)' 'include_legacy boolean' \
  "SELECT string_agg(pg_get_function_identity_arguments(p.oid), ' | ') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='contacts_count_by_type'"
expect_value 'search_contacts continua SECURITY DEFINER com 23 colunas' 'true|23' \
  "SELECT p.prosecdef::text || '|' || array_length(p.proallargtypes, 1) - p.pronargs FROM pg_proc p WHERE p.oid='public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer,boolean)'::regprocedure"

# ── GREEN: ACL reaplicado (DROP + CREATE perde o ACL e herda o default de anon) ─────────
expect_value 'anon NAO executa search_contacts' 'f' \
  "SELECT has_function_privilege('anon','public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer,boolean)','EXECUTE')"
expect_value 'authenticated e service_role executam search_contacts' 'true|true' \
  "SELECT has_function_privilege('authenticated','public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer,boolean)','EXECUTE')::text || '|' || has_function_privilege('service_role','public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer,boolean)','EXECUTE')::text"
expect_value 'anon NAO executa contacts_count_by_type' 'f' \
  "SELECT has_function_privilege('anon','public.contacts_count_by_type(boolean)','EXECUTE')"
expect_value 'authenticated e service_role executam contacts_count_by_type' 'true|true' \
  "SELECT has_function_privilege('authenticated','public.contacts_count_by_type(boolean)','EXECUTE')::text || '|' || has_function_privilege('service_role','public.contacts_count_by_type(boolean)','EXECUTE')::text"

# ── GREEN: criterio de visibilidade ──────────────────────────────────────────────────────
expect_value 'default esconde legado, telefone sintetico/curto/mascarado e excluido' 'A visivel cliente,B visivel fornecedor' \
  "$as_admin SELECT string_agg(name, ',' ORDER BY name) FROM public.search_contacts()"
expect_value 'chamada sem include_legacy (front atual) cai no default false' '2' \
  "$as_admin SELECT count(*) FROM public.search_contacts(search_term => '', page_size => 50)"
expect_value 'include_legacy=true traz os 6 vivos de volta (excluido continua fora)' '6' \
  "$as_admin SELECT count(*) FROM public.search_contacts(include_legacy => true)"
expect_value 'total_count acompanha o filtro' '2' \
  "$as_admin SELECT DISTINCT total_count FROM public.search_contacts()"
expect_value 'contacts_count_by_type() por padrao bate com a lista' 'cliente=1,fornecedor=1' \
  "$as_admin SELECT string_agg(contact_type || '=' || count, ',' ORDER BY contact_type) FROM public.contacts_count_by_type()"
expect_value 'contacts_count_by_type(true) bate com a lista com legados' 'cliente=4,fornecedor=2' \
  "$as_admin SELECT string_agg(contact_type || '=' || count, ',' ORDER BY contact_type) FROM public.contacts_count_by_type(true)"
expect_value 'KPI Total == badge Todos nos dois estados (soma das contagens == total_count)' 'true|true' \
  "$as_admin SELECT ((SELECT sum(count) FROM public.contacts_count_by_type()) = (SELECT max(total_count) FROM public.search_contacts()))::text || '|' || ((SELECT sum(count) FROM public.contacts_count_by_type(true)) = (SELECT max(total_count) FROM public.search_contacts(include_legacy => true)))::text"

# ── GREEN: permissao continua valendo com legados ligados ───────────────────────────────
expect_value 'agente so ve o proprio contato visivel por padrao' 'A visivel cliente' \
  "$as_agente SELECT string_agg(name, ',' ORDER BY name) FROM public.search_contacts()"
expect_value 'agente com include_legacy ve so os proprios (visivel + legado)' 'A visivel cliente,C legado LID' \
  "$as_agente SELECT string_agg(name, ',' ORDER BY name) FROM public.search_contacts(include_legacy => true)"
expect_value 'contacts_count_by_type segue a RLS do chamador' '1|2' \
  "$as_agente SELECT (SELECT sum(count) FROM public.contacts_count_by_type())::text || '|' || (SELECT sum(count) FROM public.contacts_count_by_type(true))::text"

printf 'OK: contatos legados fora por padrao, include_legacy=true restaura, ACL preservado\n'
