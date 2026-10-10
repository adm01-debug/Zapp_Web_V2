#!/usr/bin/env bash
# N142: prova que a policy message_reactions_select_policy usa
# get_profile_id_for_user(auth.uid()) e nao user_id = auth.uid().
#
# O bug: user_id armazena um profile id (public.profiles.id), nao um auth
# user uuid. Comparar diretamente com auth.uid() nunca casa para usuarios
# nao-admin, entao eles nao veem suas proprias reacoes.
#
# O teste aplica a migration real num PostgreSQL 17 descartavel e prova,
# com roles reais authenticated/anon (sem BYPASSRLS):
#   (a) o dono da reacao (via profile) enxerga a sua propria reacao;
#   (b) um terceiro usuario sem vinculo NAO enxerga;
#   (c) admin enxerga todas as reacoes.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261009233622_fix_message_reactions_select_policy_user_id_type.sql"
postgres_image="${MESSAGE_REACTIONS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-msg-reactions-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-msg-reactions-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_ok() {
  local label="$1" sql="$2"
  psql_sql "$sql" >/dev/null || fail "$label: deveria ter sucesso"
  printf '[PASS] %s\n' "$label"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_value_as() {
  local label="$1" expected="$2" jwt="$3" sql="$4" actual
  actual="$(as_user "$jwt" "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    (( ready_checks >= 2 )) && break
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ── BLOCO A: schema + functions + fixtures + migration ──────────────────────
cat > "$tmp_dir/setup.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT CASE WHEN nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' = '' THEN NULL ELSE (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid END $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.agent_visibility_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_see_agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(agent_id, can_see_agent_id)
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  content text
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  assigned_to uuid REFERENCES public.profiles(id)
);
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT reaction_author_check CHECK (user_id IS NOT NULL OR contact_id IS NOT NULL),
  UNIQUE(message_id, user_id, emoji),
  UNIQUE(message_id, contact_id, emoji)
);

CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1 $$;

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = _user_id AND ur.role IN ('admin','supervisor')) $$;

CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT p.id FROM public.profiles p WHERE p.user_id = _user_id
  UNION
  SELECT avg.can_see_agent_id
  FROM public.agent_visibility_grants avg
  JOIN public.profiles p ON p.id = avg.agent_id
  WHERE p.user_id = _user_id
    AND EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = _user_id AND ur.role = 'special_agent')
$$;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
SQL

psql_file "$tmp_dir/setup.sql"

# ── BLOCO B: aplicar a migration real (corrigida) ──────────────────────────
psql_file "$migration"

# ── BLOCO C: fixtures determinísticos ───────────────────────────────────────
# author = profile p1 (user u1), third = profile p3 (user u3), admin = profile p2 (user u2)
psql_sql "
INSERT INTO public.profiles (id, user_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('22222222-2222-2222-2222-222222222222', 'admin');

INSERT INTO public.messages (id, contact_id, content) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', NULL, 'msg 1');

INSERT INTO public.contacts (id, assigned_to) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

INSERT INTO public.message_reactions (message_id, user_id, emoji) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '👍');
"

# ── BLOCO D: assertions ─────────────────────────────────────────────────────

# (a) author (profile p1, user u1) enxerga sua propria reacao
expect_value_as 'A1 author vê sua propria reacao' '1' \
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}' \
  "SELECT count(*) FROM public.message_reactions WHERE message_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'"

# (b) third user (profile p3, user u3) NAO enxerga a reacao do author
expect_value_as 'A2 terceiro sem vinculo nao vê a reacao' '0' \
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}' \
  "SELECT count(*) FROM public.message_reactions WHERE message_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'"

# (c) admin enxerga todas as reacoes
expect_value_as 'A3 admin vê todas as reacoes' '1' \
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}' \
  "SELECT count(*) FROM public.message_reactions WHERE message_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'"

# (d) anon nao enxerga
expect_value_as 'A4 anon nao vê reacoes' '0' \
  '{"sub":"","role":"anon"}' \
  "SELECT count(*) FROM public.message_reactions WHERE message_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'"

printf '\n[OK] message_reactions RLS: author vê, terceiro nao vê, admin vê, anon nao vê\n'