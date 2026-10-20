#!/usr/bin/env bash
# Contrato de autorizacao da LEITURA de analises de IA e etiquetas — lacuna L8 da
# matriz IA-004 (caso de aceite N6).
#
# Roda o MESMO roteiro no mesmo container:
#   BLOCO A — estado ANTERIOR: as policies de SELECT so conhecem contato ATRIBUIDO.
#             Prova o defeito (agente de FILA nao le a analise/etiqueta do contato)
#             e o write-sem-read (grava via INSERT, que ja e largo, e nao le).
#   BLOCO B — migration aplicada: as duas policies de SELECT passam a usar
#             is_contact_visible_to_user, alinhadas ao INSERT. Prova a correcao sem
#             quebrar: contato FORA da fila continua invisivel, admin preservado,
#             contato proprio preservado, e a escrita por fila segue valendo.
#
# Estado anterior fiel ao banco de 30/09: SELECT estreito (assigned_to OR admin);
# INSERT de conversation_analyses JA endurecido (L3) com is_contact_visible_to_user.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930140000_align_ai_read_policies_with_contact_visibility.sql"
postgres_image="${AI_READ_QUEUE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-ai-read-queue-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-ai-read-queue-test-[0-9]+$ ]]; then
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
expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
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
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
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
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  tag_name text,
  confidence numeric,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Predicates: mesmo contrato dos reais (is_contact_visible_to_user cobre admin,
-- atribuicao, FILA via queue_members, e exige _user_id = auth.uid()).
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

-- RLS + policies ANTERIORES, fiéis ao banco de 30/09.
ALTER TABLE public.conversation_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_tags ENABLE ROW LEVEL SECURITY;

-- SELECT estreito (defeito L8) nas duas tabelas:
CREATE POLICY "Authenticated users can view analyses" ON public.conversation_analyses
  FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
    OR public.is_admin_or_supervisor(auth.uid())
  );
CREATE POLICY "Authenticated can view ai tags" ON public.ai_conversation_tags
  FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- INSERT de conversation_analyses JA endurecido (estado L3 de producao):
CREATE POLICY "Users can insert own analyses" ON public.conversation_analyses
  FOR INSERT TO authenticated
  WITH CHECK (
    analyzed_by = public.get_profile_id_for_user(auth.uid())
    AND public.is_contact_visible_to_user(contact_id, auth.uid())
  );
-- INSERT de ai_conversation_tags segue estreito (nao e o objeto desta correcao):
CREATE POLICY "Users can insert ai tags for assigned contacts" ON public.ai_conversation_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- Grants de producao (tabelas abertas; so a RLS segura o anon).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_analyses TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversation_tags TO anon, authenticated, service_role;
GRANT SELECT ON public.contacts TO authenticated, anon;
-- A policy ANTERIOR (estreita) tem subselect inline em profiles/contacts avaliado
-- COMO o usuario: por isso authenticated precisa de SELECT em profiles (como em producao).
GRANT SELECT ON public.profiles TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.conversation_analyses;
DELETE FROM public.ai_conversation_tags;
DELETE FROM public.contacts;
DELETE FROM public.queue_members;
DELETE FROM public.user_roles;
DELETE FROM public.queues;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', true), -- ADMIN
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', true), -- agent A (membro da fila Q1)
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', true); -- agent B (dono dos contatos alheios)
INSERT INTO public.user_roles (user_id, role)
  VALUES ('11111111-1111-1111-1111-111111111111', 'admin');

INSERT INTO public.queues (id) VALUES
  ('e0000000-0000-0000-0000-000000000001'), -- Q1
  ('e0000000-0000-0000-0000-000000000002'); -- Q2
INSERT INTO public.queue_members (queue_id, profile_id, is_active) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', true); -- A ativo em Q1

INSERT INTO public.contacts (id, phone, assigned_to, queue_id) VALUES
  ('d0000000-0000-0000-0000-000000000001', '5511900000001', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'), -- ALHEIO (atribuido a B, fila Q1)
  ('d0000000-0000-0000-0000-000000000002', '5511900000002', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002'), -- FORA (atribuido a B, fila Q2)
  ('d0000000-0000-0000-0000-000000000003', '5511900000003', 'b0000000-0000-0000-0000-000000000001', NULL); -- PROPRIO (atribuido a A)

INSERT INTO public.conversation_analyses (contact_id, analyzed_by, summary, sentiment) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'resumo ALHEIO', 'negativo'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'resumo FORA', 'negativo'),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'resumo PROPRIO', 'positivo');
INSERT INTO public.ai_conversation_tags (contact_id, tag_name, confidence, source) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'cancelamento', 0.9, 'ia'),
  ('d0000000-0000-0000-0000-000000000002', 'elogio', 0.8, 'ia'),
  ('d0000000-0000-0000-0000-000000000003', 'reclamacao', 0.7, 'ia');
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

AGENT="{\"sub\":\"22222222-2222-2222-2222-222222222222\",\"role\":\"authenticated\"}"
ADMIN="{\"sub\":\"11111111-1111-1111-1111-111111111111\",\"role\":\"authenticated\"}"
ALHEIO='d0000000-0000-0000-0000-000000000001'
FORA='d0000000-0000-0000-0000-000000000002'
PROPRIO='d0000000-0000-0000-0000-000000000003'
PERFIL_A='b0000000-0000-0000-0000-000000000001'

agent() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$AGENT" "$1"; }
admin() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$ADMIN" "$1"; }

echo '── BLOCO A: comportamento ANTES da migration (o defeito) ─────────────────────────'

expect_value 'A1 (L8) agent de FILA não lê a análise do contato da fila (defeito)' '0' \
  "$(agent "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$ALHEIO';")"
expect_value 'A2 (L8) agent de FILA não lê a etiqueta de IA do contato da fila (defeito)' '0' \
  "$(agent "SELECT count(*) FROM public.ai_conversation_tags WHERE contact_id='$ALHEIO';")"

expect_ok 'A3 agent de FILA grava análise do contato da fila (INSERT já é largo, L3)' \
  "$(agent "INSERT INTO public.conversation_analyses (contact_id, analyzed_by, summary, sentiment) VALUES ('$ALHEIO', '$PERFIL_A', 'gravada pelo agente da fila', 'neutro');")"
expect_value 'A4 write-sem-read: o agente gravou mas ainda NÃO lê o próprio registro' '0' \
  "$(agent "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$ALHEIO';")"

echo
echo '── Aplicando a migration ─────────────────────────────────────────────────────────'
psql_file "$migration"
psql_file "$tmp_dir/seed.sql"

echo
echo '── BLOCO B: comportamento DEPOIS da migration ────────────────────────────────────'

expect_value 'B1 (N6) agent de FILA agora lê a análise do contato da fila' '1' \
  "$(agent "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$ALHEIO';")"
expect_value 'B2 (N6) agent de FILA agora lê a etiqueta de IA do contato da fila' '1' \
  "$(agent "SELECT count(*) FROM public.ai_conversation_tags WHERE contact_id='$ALHEIO';")"

expect_value 'B3 contato de OUTRA fila continua invisível (não quebrou o escopo)' '0' \
  "$(agent "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$FORA';")"
expect_value 'B4 etiqueta de OUTRA fila continua invisível' '0' \
  "$(agent "SELECT count(*) FROM public.ai_conversation_tags WHERE contact_id='$FORA';")"

expect_value 'B5 admin segue lendo a análise de contato alheio (preservado)' '1' \
  "$(admin "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$ALHEIO';")"
expect_value 'B6 agent lê a análise do PRÓPRIO contato (preservado)' '1' \
  "$(agent "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$PROPRIO';")"
expect_value 'B7 agent lê a etiqueta do PRÓPRIO contato (preservado)' '1' \
  "$(agent "SELECT count(*) FROM public.ai_conversation_tags WHERE contact_id='$PROPRIO';")"

expect_ok 'B8 escrita por fila segue valendo (INSERT preservado)' \
  "$(agent "INSERT INTO public.conversation_analyses (contact_id, analyzed_by, summary, sentiment) VALUES ('$ALHEIO', '$PERFIL_A', 'segunda gravação', 'neutro');")"
expect_value 'B8b e agora ele LÊ o que gravou (write com read restaurado)' '2' \
  "$(agent "SELECT count(*) FROM public.conversation_analyses WHERE contact_id='$ALHEIO';")"

printf '\n[OK] contrato de autorizacao da leitura de analises/etiquetas (L8) verificado\n'
