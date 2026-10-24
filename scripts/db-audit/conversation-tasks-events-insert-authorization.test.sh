#!/usr/bin/env bash
# Contrato de autorizacao dos INSERTs de conversation_tasks e conversation_events
# (auditoria docs/audits/SEGURANCA_RLS_CONTATOS_MENSAGENS_2026-10-07.md: SEC-...-06 e -09).
#
# Defeitos cobertos:
#   -06: conversation_tasks INSERT nao valida a visibilidade do contato (o guard so cobre UPDATE).
#   -09: conversation_events INSERT aceita performed_by nulo (evento sem ator) e a policy usa
#        only assigned_to direto, ignorando fila/carteira que is_contact_visible_to_user cobre.
#
# BLOCO A (antes da migration) fixa o comportamento atual (o defeito). BLOCO B (depois) prova a
# correcao e garante que os fluxos reais seguem: tarefa para contato proprio, evento sem
# performed_by (vira o ator), evento para contato visto por FILA, evento de admin, anon recusado.
#
# Perfis: ALICE (agente), BRUNO (agente), CAROL (admin).
# Contatos: CVIS (da ALICE, visivel), CHID (do BRUNO, invisivel), CQUEUE (fila Q1, ALICE na fila).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011003023_harden_conversation_tasks_events_insert.sql"
postgres_image="${CONV_INSERT_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-conv-insert-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-conv-insert-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

# Roda o SQL (SET ROLE + INSERT) exigindo sucesso; a saida nao interessa.
run_ok() { psql_sql "$1" >/dev/null; }

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
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

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

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, UNIQUE (user_id, role));
CREATE TABLE public.contacts (id uuid PRIMARY KEY, assigned_to uuid, queue_id uuid);
CREATE TABLE public.queue_members (queue_id uuid, profile_id uuid, is_active boolean NOT NULL DEFAULT true);

-- Helpers canonicos (mesma assinatura/semantica dos reais de 20260909200000/20251215025014).
CREATE FUNCTION public.current_profile_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$;
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $$ SELECT id FROM public.profiles WHERE _user_id = auth.uid() AND user_id = _user_id LIMIT 1 $$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $$ SELECT profile.id FROM public.profiles AS profile WHERE _user_id = auth.uid() AND profile.user_id = _user_id $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor')) $$;
CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
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

GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_profile_id_for_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_visible_agent_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_contact_visible_to_user(uuid, uuid) TO authenticated, service_role;

CREATE TABLE public.conversation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  created_by uuid NOT NULL,
  contact_id uuid,
  status text NOT NULL DEFAULT 'open'
);

CREATE TABLE public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  event_type text NOT NULL,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

-- Corpos ATUAIS de producao — o defeito (guarda so assigned_to direto / aceita performed_by nulo).
CREATE POLICY tasks_insert_own ON public.conversation_tasks
  FOR INSERT TO authenticated
  WITH CHECK (created_by = public.current_profile_id());

CREATE POLICY "Authorized users can insert events" ON public.conversation_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (performed_by IS NULL OR performed_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1))
    AND (
      public.is_admin_or_supervisor(auth.uid())
      OR contact_id IN (
        SELECT c.id FROM public.contacts c
        WHERE c.assigned_to = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
      )
    )
  );

GRANT SELECT ON public.profiles, public.user_roles, public.contacts, public.queue_members TO authenticated, service_role;
GRANT SELECT, INSERT ON public.conversation_tasks TO authenticated, service_role;
GRANT SELECT, INSERT ON public.conversation_events TO authenticated, service_role;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.conversation_events;
DELETE FROM public.conversation_tasks;
DELETE FROM public.queue_members;
DELETE FROM public.contacts;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;
INSERT INTO public.profiles (id, user_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),  -- ALICE
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222'),  -- BRUNO
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333');  -- CAROL
INSERT INTO public.user_roles (user_id, role) VALUES
  ('33333333-3333-3333-3333-333333333333', 'admin');
INSERT INTO public.contacts (id, assigned_to, queue_id) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', NULL),  -- CVIS (ALICE)
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', NULL),  -- CHID (BRUNO)
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001');  -- CQUEUE (fila Q1)
INSERT INTO public.queue_members (queue_id, profile_id, is_active) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', true);  -- ALICE na fila Q1
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

ALICE='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
CAROL='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
ANON='{"role":"anon"}'

CVIS='d0000000-0000-0000-0000-000000000001'
CHID='d0000000-0000-0000-0000-000000000002'
CQUEUE='d0000000-0000-0000-0000-000000000003'
ALICE_P='a0000000-0000-0000-0000-000000000001'
BRUNO_P='b0000000-0000-0000-0000-000000000001'

as_alice() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims','%s',false); %s" "$ALICE" "$1"; }
as_carol() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims','%s',false); %s" "$CAROL" "$1"; }

echo '── BLOCO A: ANTES da migration (o defeito) ────────────────────────────────────────'

run_ok "$(as_alice "INSERT INTO public.conversation_tasks (title, created_by, contact_id) VALUES ('alheia', '$ALICE_P', '$CHID');")"
expect_value 'A1 tarefa para contato que NAO enxerga PASSA hoje' '1' \
  "SELECT count(*) FROM public.conversation_tasks WHERE contact_id = '$CHID'"

run_ok "$(as_alice "INSERT INTO public.conversation_events (contact_id, event_type) VALUES ('$CVIS', 'transfer');")"
expect_value 'A2 evento SEM performed_by PASSA hoje (sem ator)' '1' \
  "SELECT count(*) FROM public.conversation_events WHERE performed_by IS NULL"

expect_error 'A3 evento para contato visto por FILA e recusado hoje (predicado estreito)' \
  'row-level security' \
  "$(as_alice "INSERT INTO public.conversation_events (contact_id, event_type) VALUES ('$CQUEUE', 'transfer');")"

expect_error 'A4 evento com performed_by de TERCEIRO ja era recusado (contrato)' \
  'row-level security' \
  "$(as_alice "INSERT INTO public.conversation_events (contact_id, event_type, performed_by) VALUES ('$CVIS', 'transfer', '$BRUNO_P');")"

echo
echo '── Aplicando a migration ───────────────────────────────────────────────────────────'
psql_file "$migration"
psql_file "$tmp_dir/seed.sql"

echo
echo '── BLOCO B: DEPOIS da migration ───────────────────────────────────────────────────'

expect_error 'B1 tarefa para contato que NAO enxerga (recusado)' \
  'row-level security' \
  "$(as_alice "INSERT INTO public.conversation_tasks (title, created_by, contact_id) VALUES ('alheia', '$ALICE_P', '$CHID');")"
expect_value 'B1b nada foi gravado' '0' "SELECT count(*) FROM public.conversation_tasks"

run_ok "$(as_alice "INSERT INTO public.conversation_tasks (title, created_by, contact_id) VALUES ('minha', '$ALICE_P', '$CVIS');")"
expect_value 'B2 tarefa para o PROPRIO contato (fluxo real segue)' '1' \
  "SELECT count(*) FROM public.conversation_tasks WHERE contact_id = '$CVIS'"

run_ok "$(as_alice "INSERT INTO public.conversation_tasks (title, created_by, contact_id) VALUES ('sem-contato', '$ALICE_P', NULL);")"
expect_value 'B2b tarefa SEM contato passa (caminho de sync/backlog do app)' '1' \
  "SELECT count(*) FROM public.conversation_tasks WHERE contact_id IS NULL"

run_ok "$(as_alice "INSERT INTO public.conversation_events (contact_id, event_type) VALUES ('$CVIS', 'transfer');")"
expect_value 'B3 evento SEM performed_by passa e o ator vira o proprio perfil' '1' \
  "SELECT count(*) FROM public.conversation_events WHERE performed_by = '$ALICE_P'"
expect_value 'B3b nenhum evento sem ator' '0' \
  "SELECT count(*) FROM public.conversation_events WHERE performed_by IS NULL"

run_ok "$(as_alice "INSERT INTO public.conversation_events (contact_id, event_type) VALUES ('$CQUEUE', 'transfer');")"
expect_value 'B4 evento para contato visto por FILA passa (predicado ampliado)' '1' \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id = '$CQUEUE'"

expect_error 'B5 evento com performed_by de TERCEIRO (recusado)' \
  'performed_by' \
  "$(as_alice "INSERT INTO public.conversation_events (contact_id, event_type, performed_by) VALUES ('$CVIS', 'transfer', '$BRUNO_P');")"

run_ok "$(as_alice "INSERT INTO public.conversation_events (contact_id, event_type, performed_by) VALUES ('$CVIS', 'note', '$ALICE_P');")"
expect_value 'B6 evento com performed_by proprio explicito (passa)' '3' \
  "SELECT count(*) FROM public.conversation_events WHERE performed_by = '$ALICE_P'"

run_ok "$(as_carol "INSERT INTO public.conversation_events (contact_id, event_type) VALUES ('$CHID', 'audit');")"
expect_value 'B7 admin grava evento em contato alheio sem performed_by (passa, ator nulo)' '1' \
  "SELECT count(*) FROM public.conversation_events WHERE performed_by IS NULL"

run_ok "$(as_carol "INSERT INTO public.conversation_events (contact_id, event_type, performed_by) VALUES ('$CHID', 'audit', '$BRUNO_P');")"
expect_value 'B8 admin grava evento com performed_by de outro perfil (passa)' '1' \
  "SELECT count(*) FROM public.conversation_events WHERE performed_by = '$BRUNO_P'"

expect_error 'B9 anon e recusado (sem GRANT/policy de INSERT)' \
  'permission denied' \
  "SET ROLE anon; SELECT set_config('request.jwt.claims','$ANON',false); INSERT INTO public.conversation_events (contact_id, event_type) VALUES ('$CVIS', 'x');"

printf '\n[OK] contrato de autorizacao dos INSERTs de conversation_tasks/conversation_events verificado\n'
