#!/usr/bin/env bash
# DASH-ACCEPTANCE-001 / DASH-092 ("Testar com permissões reais"): prova, num
# PostgreSQL 17 descartável, que a RLS do módulo Dashboard é realmente aplicada
# quando o chamador NÃO tem BYPASSRLS — fechando a lacuna de que os testes SQL
# atuais (supabase/tests/rls_dashboard.sql e dashboard_rpc_filters.sql) rodam como
# service_role, que ignora RLS, e por isso nunca provam o isolamento de fato.
#
# RED  — o papel que os testes atuais usam (service_role, BYPASSRLS) vê TODOS os
#        contatos/eventos mesmo com o jwt de um único agente: prova que essa rota
#        é incapaz de detectar RLS aberta.
# GREEN — como authenticated (permissão real, sem BYPASSRLS) a RLS isola: agente
#        vê só o próprio contato/evento, admin vê tudo, e a prova NÃO é vácuo
#        (desligar a RLS expõe os dados de outro agente e o canário falha).
#
# Nenhuma credencial de produção entra aqui. Read-only sobre as tabelas (só SELECT).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${DASH_RLS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-dash-rls-test-$$"
tmp_dir="$(mktemp -d /tmp/zapp-v2-dash-rls-test.XXXXXX)"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-dash-rls-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    /tmp/zapp-v2-dash-rls-test.*) rm -rf -- "$tmp_dir" ;;
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
  ((passed += 1))
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

# ── Esquema mínimo do módulo Dashboard, fiel às migrations vigentes ─────────────────
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
CREATE TABLE public.agent_visibility_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  can_see_agent_id uuid NOT NULL
);
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
-- A policy SELECT de contacts lê queue_members diretamente (subquery do caller);
-- em produção o papel authenticated tem SELECT aqui.
GRANT SELECT ON public.queue_members TO authenticated, service_role;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  assigned_to uuid,
  queue_id uuid
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.contacts TO authenticated, service_role;

CREATE TABLE public.conversation_events (
  id uuid PRIMARY KEY,
  contact_id uuid NOT NULL,
  performed_by uuid
);
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.conversation_events TO authenticated, service_role;

-- Helpers SECURITY DEFINER (mesma semântica das migrations de produção).
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id=_user_id LIMIT 1 $$;

CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$
    SELECT p.id FROM public.profiles p WHERE p.user_id = _user_id
    UNION
    SELECT avg.can_see_agent_id
    FROM public.agent_visibility_grants avg
    JOIN public.profiles p ON p.id = avg.agent_id
    WHERE p.user_id = _user_id
  $$;

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  ) $$;

CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT _user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.contacts AS contact
        WHERE contact.id = _contact_id
          AND (
            public.is_admin_or_supervisor(_user_id)
            OR contact.assigned_to IN (SELECT public.get_visible_agent_ids(_user_id))
            OR EXISTS (
              SELECT 1 FROM public.queue_members AS member
              WHERE member.queue_id = contact.queue_id
                AND member.profile_id = public.get_profile_id_for_user(_user_id)
                AND member.is_active = true
            )
          )
      )
  $$;

-- Policies SELECT vigentes do módulo (snapshot 2026-09 + consolidação E08).
CREATE POLICY contacts_select_policy ON public.contacts FOR SELECT TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    OR assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.queue_members qm
      WHERE qm.queue_id = contacts.queue_id
        AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
        AND qm.is_active = true
    )
  );

CREATE POLICY conversation_events_select_policy ON public.conversation_events FOR SELECT TO authenticated
  USING (
    public.is_contact_visible_to_user(contact_id, auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

INSERT INTO public.profiles VALUES
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000009');

INSERT INTO public.user_roles VALUES
  ('20000000-0000-0000-0000-000000000001','agent'),
  ('20000000-0000-0000-0000-000000000002','agent'),
  ('20000000-0000-0000-0000-000000000009','admin');

INSERT INTO public.contacts (id, name, assigned_to, queue_id) VALUES
  ('30000000-0000-0000-0000-000000000001','Contato do Agente A','10000000-0000-0000-0000-000000000001',NULL),
  ('30000000-0000-0000-0000-000000000002','Contato do Agente B','10000000-0000-0000-0000-000000000002',NULL);

INSERT INTO public.conversation_events (id, contact_id, performed_by) VALUES
  ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

AGENTE='20000000-0000-0000-0000-000000000001'
ADMIN='20000000-0000-0000-0000-000000000009'
as_agente="SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE';"
as_admin="SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN';"

# ── RED: service_role (o papel dos testes atuais) ignora RLS ────────────────────────
expect_value 'RED: service_role ve os 2 contatos mesmo com jwt de agente A (BYPASSRLS)' '2' \
  "SET ROLE service_role; SET request.jwt.claim.sub='$AGENTE'; SELECT count(*) FROM public.contacts"
expect_value 'RED: service_role ve os 2 eventos mesmo com jwt de agente A (BYPASSRLS)' '2' \
  "SET ROLE service_role; SET request.jwt.claim.sub='$AGENTE'; SELECT count(*) FROM public.conversation_events"

# ── GREEN: authenticated (permissão real) aplica RLS ─────────────────────────────────
expect_value 'GREEN: agente A ve somente o proprio contato' '1' \
  "$as_agente SELECT count(*) FROM public.contacts"
expect_value 'GREEN: agente A NAO ve o contato do agente B' '0' \
  "$as_agente SELECT count(*) FROM public.contacts WHERE name = 'Contato do Agente B'"
expect_value 'GREEN: agente A ve somente o proprio evento de conversa' '1' \
  "$as_agente SELECT count(*) FROM public.conversation_events"
expect_value 'GREEN: admin ve os 2 contatos (staff enxerga tudo)' '2' \
  "$as_admin SELECT count(*) FROM public.contacts"

# ── Não-vácuo: desligar a RLS expõe o dado do outro agente e o canário falha ─────────
psql_sql 'ALTER TABLE public.contacts DISABLE ROW LEVEL SECURITY' >/dev/null
expect_value 'NAO-VACUO: com RLS desligada, agente A veria os 2 contatos' '2' \
  "$as_agente SELECT count(*) FROM public.contacts"
psql_sql 'ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY' >/dev/null
expect_value 'NAO-VACUO: RLS religada isola de novo (agente A volta a ver 1)' '1' \
  "$as_agente SELECT count(*) FROM public.contacts"

printf 'OK: RLS do Dashboard aplicada com permissao real (%s); %d cenarios aprovados.\n' "$postgres_image" "$passed"
