#!/usr/bin/env bash
# Contrato de distribuicao de filas (round robin / menos ocupado / habilidade),
# limite por atendente, fixacao por contato e transbordo sem ciclo.
#
# Prova num Postgres 17 descartavel (docker local): recria o schema minimo que os
# objetos reais tocam, aplica a migration REAL
# (supabase/migrations/20261011193310_queues_distribution_overflow.sql), exercita
# as regras como o banco faz (INSERT/UPDATE em contacts dispara os triggers) e,
# no fim, executa o bloco de rollback extraido do proprio cabecalho da migration
# e reaplica a migration (idempotencia).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011193310_queues_distribution_overflow.sql"
postgres_image="${QUEUES_DIST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-queues-dist-$$"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
  if [[ "$container_name" =~ ^zapp-v2-queues-dist-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || fail "$label: deveria falhar"
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: erro nao continha '$needle'"; }
  printf '[PASS] %s\n' "$label"
}

run_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_file_value() {
  local label="$1" expected="$2" file="$3" actual
  actual="$(run_file "$file" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

expect_file_error() {
  local label="$1" needle="$2" file="$3" output status
  set +e
  output="$(run_file "$file" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || fail "$label: deveria falhar"
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: erro nao continha '$needle'"; }
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
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

# ---------- schema minimo + estado "antes" reproduzido ----------
cat > "$tmp_dir/pre.sql" <<'SQL'
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role'
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL
);
CREATE TABLE public.queues (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  color text,
  is_active boolean NOT NULL DEFAULT true,
  priority integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (queue_id, profile_id)
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  queue_id uuid REFERENCES public.queues(id),
  assigned_to uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_agent_id uuid REFERENCES public.profiles(id),
  to_agent_id uuid REFERENCES public.profiles(id),
  from_queue_id uuid REFERENCES public.queues(id),
  to_queue_id uuid REFERENCES public.queues(id),
  metadata jsonb DEFAULT '{}',
  performed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  skill_name text NOT NULL,
  skill_level integer
);
CREATE TABLE public.queue_skill_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  skill_name text NOT NULL,
  min_level integer
);

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_user_id AND ur.role IN ('admin','supervisor'))
$$;

-- Stub do distribuidor existente (a migration substitui o corpo pelo real) + trigger ja existente
CREATE FUNCTION public.auto_assign_to_queue_agent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RETURN NEW; END; $$;
-- Stubs com o ACL REAL (para o CREATE OR REPLACE da migration preservar, como no banco de verdade)
CREATE FUNCTION public.skill_based_assign(p_queue_id uuid) RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN RETURN NULL; END; $$;
REVOKE ALL ON FUNCTION public.auto_assign_to_queue_agent() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.skill_based_assign(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.skill_based_assign(uuid) TO authenticated;
CREATE TRIGGER on_contact_queue_auto_assign
  BEFORE INSERT OR UPDATE OF queue_id ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.auto_assign_to_queue_agent();

-- Logger real de conversation_events (copiado de 20260409100431) — prova do registro do transbordo
CREATE FUNCTION public.log_assignment_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.conversation_events (contact_id, event_type, from_agent_id, to_agent_id, performed_by, metadata)
    VALUES (NEW.id,
      CASE WHEN OLD.assigned_to IS NULL THEN 'assign' WHEN NEW.assigned_to IS NULL THEN 'unassign' ELSE 'transfer' END,
      OLD.assigned_to, NEW.assigned_to, COALESCE(NEW.assigned_to, OLD.assigned_to),
      jsonb_build_object('old_queue', OLD.queue_id, 'new_queue', NEW.queue_id));
  END IF;
  IF OLD.queue_id IS DISTINCT FROM NEW.queue_id THEN
    INSERT INTO public.conversation_events (contact_id, event_type, from_queue_id, to_queue_id, performed_by, metadata)
    VALUES (NEW.id, 'queue_transfer', OLD.queue_id, NEW.queue_id, NEW.assigned_to,
            jsonb_build_object('agent', NEW.assigned_to));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_log_assignment_change
  AFTER UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.log_assignment_change();
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

# ---------- aplica a migration REAL ----------
psql_file "$migration" >/dev/null || fail 'a migration real nao aplicou no Postgres descartavel'
printf '[PASS] migration real aplicada\n'

# ---------- fixtures ----------
cat > "$tmp_dir/fixtures.sql" <<'SQL'
-- perfis
INSERT INTO public.profiles (id, user_id) VALUES
 ('00000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-0000000000a2'),
 ('00000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-0000000000b2'),
 ('00000000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-0000000000c2','10000000-0000-0000-0000-0000000000c2'),
 ('00000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-0000000000d1'),
 ('00000000-0000-0000-0000-0000000000ad','10000000-0000-0000-0000-0000000000ad');
INSERT INTO public.user_roles (user_id, role)
 SELECT user_id, 'agent' FROM public.profiles;
UPDATE public.user_roles SET role = 'admin' WHERE user_id = '10000000-0000-0000-0000-0000000000ad';

-- filas
INSERT INTO public.queues (id, name, is_active, priority, distribution) VALUES
 ('20000000-0000-0000-0000-0000000000f0','default-ativo', true, 1, 'least_busy'),
 ('20000000-0000-0000-0000-0000000000f9','pausada-prioridade-0', true, 0, 'least_busy'),
 ('20000000-0000-0000-0000-00000000000a','menos-ocupado', true, 100, 'least_busy'),
 ('20000000-0000-0000-0000-00000000000b','round-robin', true, 100, 'round_robin'),
 ('20000000-0000-0000-0000-00000000000c','limite-1', true, 100, 'least_busy'),
 ('20000000-0000-0000-0000-00000000000d','fixacao', true, 100, 'least_busy'),
 ('20000000-0000-0000-0000-00000000000e','pausada', true, 100, 'least_busy'),
 ('20000000-0000-0000-0000-000000000010','origem', true, 100, 'least_busy'),
 ('20000000-0000-0000-0000-000000000011','transbordo', true, 100, 'least_busy'),
 ('20000000-0000-0000-0000-000000000012','habilidade', true, 100, 'skill');
UPDATE public.queues SET paused = true WHERE id IN
 ('20000000-0000-0000-0000-0000000000f9','20000000-0000-0000-0000-00000000000e');
UPDATE public.queues SET max_per_agent = 1 WHERE id = '20000000-0000-0000-0000-00000000000c';
UPDATE public.queues SET sticky_enabled = true WHERE id = '20000000-0000-0000-0000-00000000000d';
UPDATE public.queues SET overflow_queue_id = '20000000-0000-0000-0000-000000000011'
 WHERE id = '20000000-0000-0000-0000-000000000010';

-- membros
INSERT INTO public.queue_members (queue_id, profile_id) VALUES
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1'),
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a2'),
 ('20000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000b1'),
 ('20000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000b2'),
 ('20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c1'),
 ('20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c2'),
 ('20000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-0000000000c1'),
 ('20000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-0000000000c2'),
 ('20000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000d1');
-- origem (fila 010) sem membros; limitada (c) com 2 agentes

-- carga por agente (contatos ja atribuidos)
INSERT INTO public.contacts (id, queue_id, assigned_to, created_at) VALUES
 ('30000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1', now()),
 ('30000000-0000-0000-0000-0000000000b1','20000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000b1','2026-01-01T00:00:00Z'),
 ('30000000-0000-0000-0000-0000000000b2','20000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000b1','2026-01-01T01:00:00Z'),
 ('30000000-0000-0000-0000-0000000000b3','20000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000b2','2026-01-02T00:00:00Z'),
 ('30000000-0000-0000-0000-0000000000c1','20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c1', now()),
 ('30000000-0000-0000-0000-0000000000d1','20000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-0000000000c1', now()),
 ('30000000-0000-0000-0000-0000000000d2','20000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-0000000000c1', now());

-- habilidade: exigencia da fila 012
INSERT INTO public.queue_skill_requirements (queue_id, skill_name, min_level)
 VALUES ('20000000-0000-0000-0000-000000000012','vendas', 2);
INSERT INTO public.queue_members (queue_id, profile_id) VALUES
 ('20000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-0000000000a1'),
 ('20000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-0000000000a2');
INSERT INTO public.agent_skills (profile_id, skill_name, skill_level) VALUES
 ('00000000-0000-0000-0000-0000000000a1','vendas', 2),
 ('00000000-0000-0000-0000-0000000000a2','vendas', 1);
-- a1 fica com carga maior para provar que 'skill' nao e so menos-ocupado
INSERT INTO public.contacts (id, queue_id, assigned_to, created_at) VALUES
 ('30000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-0000000000a1', now()),
 ('30000000-0000-0000-0000-0000000000e2','20000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-0000000000a1', now());
SQL
psql_file "$tmp_dir/fixtures.sql" >/dev/null
printf '[PASS] fixtures criadas\n'

# ---------- 1) menos-ocupado (padrao preservado) ----------
psql_sql "INSERT INTO public.contacts (id, queue_id) VALUES ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a');" >/dev/null
expect_value 'least_busy: escolhe o agente com menos contatos' \
  '00000000-0000-0000-0000-0000000000a2' \
  "SELECT assigned_to FROM public.contacts WHERE id='40000000-0000-0000-0000-000000000001'"

# ---------- 2) round robin (nao e menos-ocupado) ----------
psql_sql "INSERT INTO public.contacts (id, queue_id) VALUES ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-00000000000b');" >/dev/null
expect_value 'round_robin: rotaciona pelo ultimo atendimento (b1, mesmo com mais carga)' \
  '00000000-0000-0000-0000-0000000000b1' \
  "SELECT assigned_to FROM public.contacts WHERE id='40000000-0000-0000-0000-000000000002'"

# ---------- 3) max_per_agent ----------
psql_sql "INSERT INTO public.contacts (id, queue_id) VALUES ('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-00000000000c');" >/dev/null
expect_value 'max_per_agent: pula o agente saturado (c1) e usa o livre (c2)' \
  '00000000-0000-0000-0000-0000000000c2' \
  "SELECT assigned_to FROM public.contacts WHERE id='40000000-0000-0000-0000-000000000003'"
psql_sql "INSERT INTO public.contacts (id, queue_id) VALUES ('40000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-00000000000c');" >/dev/null
expect_value 'max_per_agent: todos saturados -> sem atribuicao' \
  '' \
  "SELECT COALESCE(assigned_to::text,'') FROM public.contacts WHERE id='40000000-0000-0000-0000-000000000004'"

# ---------- 4) fixacao (sticky) ----------
# contato volta para a fila de fixacao: ultimo atendente c1 deve ser preferido,
# mesmo com c2 mais livre (least_busy escolheria c2).
psql_sql "INSERT INTO public.contacts (id, queue_id) VALUES ('40000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-00000000000a');" >/dev/null
psql_sql "INSERT INTO public.conversation_events (contact_id, event_type, to_agent_id) VALUES ('40000000-0000-0000-0000-000000000005','assign','00000000-0000-0000-0000-0000000000c1');" >/dev/null
psql_sql "UPDATE public.contacts SET assigned_to = NULL WHERE id='40000000-0000-0000-0000-000000000005';" >/dev/null
psql_sql "UPDATE public.contacts SET queue_id = '20000000-0000-0000-0000-00000000000d' WHERE id='40000000-0000-0000-0000-000000000005';" >/dev/null
expect_value 'sticky: fixa no ultimo atendente do contato (c1)' \
  '00000000-0000-0000-0000-0000000000c1' \
  "SELECT assigned_to FROM public.contacts WHERE id='40000000-0000-0000-0000-000000000005'"

# sticky com o ultimo atendente fora da fila -> cai no menos-ocupado (c2)
psql_sql "INSERT INTO public.contacts (id, queue_id) VALUES ('40000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-00000000000a');" >/dev/null
psql_sql "INSERT INTO public.conversation_events (contact_id, event_type, to_agent_id) VALUES ('40000000-0000-0000-0000-000000000006','assign','00000000-0000-0000-0000-0000000000a1');" >/dev/null
psql_sql "UPDATE public.contacts SET assigned_to = NULL WHERE id='40000000-0000-0000-0000-000000000006';" >/dev/null
psql_sql "UPDATE public.contacts SET queue_id = '20000000-0000-0000-0000-00000000000d' WHERE id='40000000-0000-0000-0000-000000000006';" >/dev/null
expect_value 'sticky: ultimo atendente fora da fila -> cai no menos-ocupado (c2)' \
  '00000000-0000-0000-0000-0000000000c2' \
  "SELECT assigned_to FROM public.contacts WHERE id='40000000-0000-0000-0000-000000000006'"

# ---------- 5) fila pausada nao atribui ----------
psql_sql "INSERT INTO public.contacts (id, queue_id) VALUES ('40000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-00000000000e');" >/dev/null
expect_value 'fila pausada: nao atribui' '' \
  "SELECT COALESCE(assigned_to::text,'') FROM public.contacts WHERE id='40000000-0000-0000-0000-000000000007'"
expect_value 'fila pausada: nao transborda nem troca de fila' \
  '20000000-0000-0000-0000-00000000000e' \
  "SELECT queue_id FROM public.contacts WHERE id='40000000-0000-0000-0000-000000000007'"

# ---------- 6) habilidade ----------
psql_sql "INSERT INTO public.contacts (id, queue_id) VALUES ('40000000-0000-0000-0000-000000000008','20000000-0000-0000-0000-000000000012');" >/dev/null
expect_value 'skill: so o agente que cumpre o requisito (a1), nao o mais livre' \
  '00000000-0000-0000-0000-0000000000a1' \
  "SELECT assigned_to FROM public.contacts WHERE id='40000000-0000-0000-0000-000000000008'"

# ---------- 7) transbordo + registro ----------
docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "INSERT INTO public.contacts (id, queue_id) VALUES ('40000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000010');" >/dev/null
expect_value 'transbordo: contato sem atendente vai para a fila de overflow' \
  '20000000-0000-0000-0000-000000000011' \
  "SELECT queue_id FROM public.contacts WHERE id='40000000-0000-0000-0000-000000000009'"
expect_value 'transbordo: contato e atribuido na fila de overflow (d1)' \
  '00000000-0000-0000-0000-0000000000d1' \
  "SELECT assigned_to FROM public.contacts WHERE id='40000000-0000-0000-0000-000000000009'"
expect_value 'transbordo: registrado em conversation_events (queue_transfer origem->overflow)' \
  '1' \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id='40000000-0000-0000-0000-000000000009' AND event_type='queue_transfer' AND from_queue_id='20000000-0000-0000-0000-000000000010' AND to_queue_id='20000000-0000-0000-0000-000000000011'"

# ---------- 8) fila default pula a pausada ----------
psql_sql "INSERT INTO public.contacts (id) VALUES ('40000000-0000-0000-0000-00000000000a');" >/dev/null
expect_value 'fila default: escolhe ativa e nao-pausada (prioridade 0 pausada e ignorada)' \
  '20000000-0000-0000-0000-0000000000f0' \
  "SELECT queue_id FROM public.contacts WHERE id='40000000-0000-0000-0000-00000000000a'"

# ---------- 9) transbordo sem ciclo ----------
expect_error 'ciclo: fila nao transborda para si mesma' 'nao pode transbordar para si mesma' \
  "UPDATE public.queues SET overflow_queue_id='20000000-0000-0000-0000-00000000000a' WHERE id='20000000-0000-0000-0000-00000000000a';"
psql_sql "UPDATE public.queues SET overflow_queue_id='20000000-0000-0000-0000-0000000000f0' WHERE id='20000000-0000-0000-0000-00000000000b';" >/dev/null
expect_error 'ciclo: fila nao fecha ciclo (b -> f0 -> b)' 'ciclo de transbordo detectado' \
  "UPDATE public.queues SET overflow_queue_id='20000000-0000-0000-0000-00000000000b' WHERE id='20000000-0000-0000-0000-0000000000f0';"

# ---------- 10) permissoes (anon / authenticated / novo) ----------
expect_value 'permissao: anon NAO executa queue_pick_agent' '0' \
  "SELECT has_function_privilege('anon','public.queue_pick_agent(uuid,uuid)','EXECUTE')::int"
expect_value 'permissao: authenticated NAO executa queue_pick_agent' '0' \
  "SELECT has_function_privilege('authenticated','public.queue_pick_agent(uuid,uuid)','EXECUTE')::int"
expect_value 'permissao: anon NAO executa queue_overflow_rewrite' '0' \
  "SELECT has_function_privilege('anon','public.queue_overflow_rewrite()','EXECUTE')::int"
expect_value 'permissao: authenticated NAO executa queues_prevent_overflow_cycle' '0' \
  "SELECT has_function_privilege('authenticated','public.queues_prevent_overflow_cycle()','EXECUTE')::int"

# ---------- 10b) quem pode / quem nao pode / anonimo (skill_based_assign) ----------
cat > "$tmp_dir/perm-admin.sql" <<'SQL'
BEGIN;
SET LOCAL request.jwt.claims = '{"role":"authenticated"}';
SET LOCAL app.user_id = '10000000-0000-0000-0000-0000000000ad';
SELECT (public.skill_based_assign('20000000-0000-0000-0000-00000000000a') IS NOT NULL)::int;
COMMIT;
SQL
expect_file_value 'permissao: admin (jwt authenticated) USA skill_based_assign' '1' "$tmp_dir/perm-admin.sql"

cat > "$tmp_dir/perm-agent.sql" <<'SQL'
BEGIN;
SET LOCAL request.jwt.claims = '{"role":"authenticated"}';
SET LOCAL app.user_id = '10000000-0000-0000-0000-0000000000a2';
SELECT public.skill_based_assign('20000000-0000-0000-0000-00000000000a');
COMMIT;
SQL
expect_file_error 'permissao: agente comum (sem perfil admin) NAO usa skill_based_assign' \
  'requer perfil admin ou supervisor' "$tmp_dir/perm-agent.sql"

cat > "$tmp_dir/perm-anon.sql" <<'SQL'
BEGIN;
SET LOCAL ROLE anon;
SELECT public.skill_based_assign('20000000-0000-0000-0000-00000000000a');
COMMIT;
SQL
expect_file_error 'permissao: anonimo NAO usa skill_based_assign (EXECUTE negado)' \
  'permission denied for function skill_based_assign' "$tmp_dir/perm-anon.sql"

# ---------- 11) rollback de verdade + reaplicacao ----------
awk '
  /^-- Rollback \(SQL execut/ { f=1; next }
  f && /^--   [^ ]/ { sub(/^--   /, ""); print; next }
  f { exit }
' "$migration" > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'rollback vazio: nada foi extraido do cabecalho'
psql_file "$tmp_dir/rollback.sql" >/dev/null || fail 'o bloco de rollback nao executou'
expect_value 'rollback: coluna distribution removida' '0' \
  "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='queues' AND column_name='distribution')::int"
expect_value 'rollback: funcao queue_pick_agent removida' 'f' \
  "SELECT to_regprocedure('public.queue_pick_agent(uuid,uuid)') IS NOT NULL"
expect_value 'rollback: body antigo do distribuidor restaurado (sem paused)' '0' \
  "SELECT (position('paused' in pg_get_functiondef('public.auto_assign_to_queue_agent()'::regprocedure)) > 0)::int"
psql_file "$migration" >/dev/null || fail 'a migration nao reaplicou depois do rollback'
expect_value 'reaplicacao: migration idempotente (distribution de volta)' '1' \
  "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='queues' AND column_name='distribution')::int"

printf '\n[OK] contrato de distribuicao/transbordo de filas provado\n'
