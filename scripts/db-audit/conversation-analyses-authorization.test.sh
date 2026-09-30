#!/usr/bin/env bash
# Contrato de autorizacao do INSERT em conversation_analyses — lacuna L3 da matriz
# IA-004 (caso de aceite N14).
#
# Roda o MESMO roteiro duas vezes no mesmo container:
#   BLOCO A — estado ANTERIOR a migration: prova o defeito (agente grava analise de IA,
#             com resumo/sentimento do contato, para contato fora do escopo e com
#             analyzed_by NULL, forjando registro sem autor).
#   BLOCO B — migration aplicada: prova a correcao sem quebrar os caminhos legitimos
#             (analise do proprio contato, admin, service_role/edge function) e o
#             endurecimento de ACL do anon.
#
# Estado anterior fiel ao banco de 30/09: policy definida em
# 20260317222757_41908e22-ec3f-44f2-bf99-a82aca617b48.sql, grants completos para
# anon/authenticated/service_role e RLS ligado sem FORCE.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930100000_harden_conversation_analyses_insert_policy.sql"
postgres_image="${ANALYSES_AUTHZ_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-analyses-authz-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-analyses-authz-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
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

expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label: deveria falhar, mas passou"
  fi
  if [[ "$output" != *"$needle"* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label: esperava '$needle' no erro"
  fi
  printf '[PASS] %s\n' "$label"
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  # Chamadas que preparam a sessao (SET ROLE / set_config) imprimem o proprio
  # retorno antes do resultado: o valor medido e sempre a ULTIMA linha.
  actual="$(psql_sql "$sql" | tail -n1)"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s\n' "$label"
}

expect_ok() {
  local label="$1" sql="$2"
  psql_sql "$sql" >/dev/null || fail "$label: deveria ter sucesso"
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
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;

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
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.queue_members (
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL,
  PRIMARY KEY (queue_id, profile_id)
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  phone text NOT NULL,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id)
);

CREATE TABLE public.conversation_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  analyzed_by uuid REFERENCES public.profiles(id),
  summary text,
  sentiment text,
  sentiment_score numeric,
  status text DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Predicates: mesmo contrato dos reais.
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT profile.id FROM public.profiles profile
        WHERE _user_id = auth.uid() AND profile.user_id = _user_id LIMIT 1 $$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id = _user_id $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = _user_id AND ur.role IN ('admin','supervisor')) $$;
-- Corpo fiel ao de producao (cobre admin e exige _user_id = auth.uid()).
CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT _user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.contacts AS contact
          WHERE contact.id = _contact_id
            AND (
              public.is_admin_or_supervisor(_user_id)
              OR contact.assigned_to IN (SELECT public.get_visible_agent_ids(_user_id))
              OR EXISTS (SELECT 1 FROM public.queue_members AS member
                         WHERE member.queue_id = contact.queue_id
                           AND member.profile_id = public.get_profile_id_for_user(_user_id)
                           AND member.is_active = true)
            )
        ) $$;

-- RLS + policies ANTERIORES (20260317222757_41908e22-...), como estao em producao.
ALTER TABLE public.conversation_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view analyses" ON public.conversation_analyses
  FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
    OR public.is_admin_or_supervisor(auth.uid())
  );

CREATE POLICY "Users can insert own analyses" ON public.conversation_analyses
  FOR INSERT TO authenticated
  WITH CHECK (
    analyzed_by IS NULL
    OR analyzed_by IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- Grants de producao (tabela aberta para os tres papeis; so a RLS segurava o anon).
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.conversation_analyses TO anon, authenticated, service_role;
GRANT SELECT ON public.contacts TO authenticated, anon;
-- A policy ANTERIOR tem subselect inline em profiles e e avaliada COMO o usuario:
-- por isso `authenticated` precisa de SELECT em profiles (como em producao).
GRANT SELECT ON public.profiles TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.conversation_analyses;
DELETE FROM public.contacts;
DELETE FROM public.queue_members;
DELETE FROM public.user_roles;
DELETE FROM public.queues;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', true), -- ADMIN
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', true), -- agent A (sem fila/carteira)
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', true); -- agent B (dono do contato alheio)
INSERT INTO public.user_roles (user_id, role)
  VALUES ('11111111-1111-1111-1111-111111111111', 'admin');

INSERT INTO public.contacts (id, phone, assigned_to) VALUES
  ('d0000000-0000-0000-0000-000000000001', '5511900000001', 'c0000000-0000-0000-0000-000000000001'), -- ALHEIO
  ('d0000000-0000-0000-0000-000000000002', '5511900000002', 'b0000000-0000-0000-0000-000000000001'); -- PROPRIO
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

AGENT="{\"sub\":\"22222222-2222-2222-2222-222222222222\",\"role\":\"authenticated\"}"
ADMIN="{\"sub\":\"11111111-1111-1111-1111-111111111111\",\"role\":\"authenticated\"}"
ALHEIO='d0000000-0000-0000-0000-000000000001'
PROPRIO='d0000000-0000-0000-0000-000000000002'
PERFIL_A='b0000000-0000-0000-0000-000000000001'
PERFIL_B='c0000000-0000-0000-0000-000000000001'

agent() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$AGENT" "$1"; }
admin() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$ADMIN" "$1"; }

INSERT_ANALISE='INSERT INTO public.conversation_analyses (contact_id, analyzed_by, summary, sentiment) VALUES'

echo '── BLOCO A: comportamento ANTES da migration (o defeito) ─────────────────────────'

expect_ok 'A1 (L3) agent grava análise de IA em contato ALHEIO com analyzed_by NULL' \
  "$(agent "$INSERT_ANALISE ('$ALHEIO', NULL, 'resumo do contato de outro', 'negativo');")"
expect_value 'A1 análise forjada persistida' '1' \
  "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$ALHEIO' AND analyzed_by IS NULL"

expect_ok 'A2 agent grava análise de IA em contato ALHEIO assinando com o próprio perfil' \
  "$(agent "$INSERT_ANALISE ('$ALHEIO', '$PERFIL_A', 'resumo 2', 'negativo');")"
expect_value 'A2 análise fora do escopo persistida' '2' \
  "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$ALHEIO'"

expect_error 'A3 anon tenta gravar (hoje só a RLS barra)' \
  'row-level security policy' \
  "SET ROLE anon; SELECT set_config('request.jwt.claims','{\"role\":\"anon\"}',false); $INSERT_ANALISE ('$PROPRIO', NULL, 'anon', 'negativo');"

echo
echo '── Aplicando a migration ─────────────────────────────────────────────────────────'
psql_file "$migration"
psql_file "$tmp_dir/seed.sql"

echo
echo '── BLOCO B: comportamento DEPOIS da migration ────────────────────────────────────'

expect_error 'B1 (N14) agent -> contato ALHEIO com analyzed_by NULL é recusado' \
  'row-level security policy' \
  "$(agent "$INSERT_ANALISE ('$ALHEIO', NULL, 'forjada', 'negativo');")"
expect_value 'B1 nada persistido' '0' \
  "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$ALHEIO' AND analyzed_by IS NULL"

expect_error 'B2 agent -> contato ALHEIO (mesmo assinando com o próprio perfil) é recusado' \
  'row-level security policy' \
  "$(agent "$INSERT_ANALISE ('$ALHEIO', '$PERFIL_A', 'fora do escopo', 'negativo');")"
expect_value 'B2 nenhuma análise fora do escopo' '0' \
  "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$ALHEIO'"

expect_ok 'B3 agent grava análise do PRÓPRIO contato (caminho legítimo preservado)' \
  "$(agent "$INSERT_ANALISE ('$PROPRIO', '$PERFIL_A', 'resumo legitimo', 'positivo');")"
expect_value 'B3 análise legítima persistida' '1' \
  "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$PROPRIO' AND analyzed_by='$PERFIL_A'"

expect_error 'B4 agent não pode forjar autoria de outro agente' \
  'row-level security policy' \
  "$(agent "$INSERT_ANALISE ('$PROPRIO', '$PERFIL_B', 'autoria forjada', 'positivo');")"

expect_ok 'B5 ADMIN grava análise de contato alheio (admin vê tudo) - preservado' \
  "$(admin "$INSERT_ANALISE ('$ALHEIO', 'a0000000-0000-0000-0000-000000000001', 'analise do admin', 'neutro');")"
expect_value 'B5 análise do admin persistida' '1' \
  "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$ALHEIO'"

expect_ok 'B6 service_role grava (edge function ai-conversation-analysis) - preservado' \
  "SET ROLE service_role; SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false); $INSERT_ANALISE ('$ALHEIO', NULL, 'via service_role', 'neutro');"
expect_value 'B6 gravação de serviço persistida' '2' \
  "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$ALHEIO'"

expect_error 'B7 anon agora é barrado pela ACL (REVOKE), não só pela RLS' \
  'permission denied' \
  "SET ROLE anon; SELECT set_config('request.jwt.claims','{\"role\":\"anon\"}',false); $INSERT_ANALISE ('$PROPRIO', NULL, 'anon', 'negativo');"

expect_value 'B8 agent vê a própria análise' '1' \
  "$(agent "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$PROPRIO';")"
expect_value 'B8b agent NÃO vê a análise do contato alheio (SELECT escopado segue valendo)' '0' \
  "$(agent "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$ALHEIO';")"

printf '\n[OK] contrato de autorizacao do INSERT em conversation_analyses verificado\n'
