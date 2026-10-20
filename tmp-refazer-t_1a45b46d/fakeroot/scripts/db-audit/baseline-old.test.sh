#!/usr/bin/env bash
# followup-runtime.test.sh
# Contrato do RUNTIME de follow-ups (cartão t_f949da13, área banco).
#
# Roda o MESMO roteiro no mesmo container, em dois blocos, aplicando a MIGRATION REAL
# (supabase/migrations/20261012124904_followup_runtime_fila_execucoes.sql) e executando
# como o PAPEL REAL (set role authenticated/anon/service_role + request.jwt.claims):
#   BLOCO A — estado ANTERIOR (fiel ao canônico): as 4 RPCs não existem (o painel de
#             pendentes não tem de onde ler), não há coluna de motivo e `status` aceita
#             QUALQUER texto (sem CHECK).
#   BLOCO B — migration aplicada: enroll/complete/cancel/due com autorização correta
#             (staff OU atendente do contato), RLS de SELECT por visibilidade de contato,
#             vocabulário de status + motivo, gatilho que cancela os passos seguintes quando
#             o contato responde, e backfill do status legado.
#   BLOCO C — a linha `-- Rollback:` da migration EXECUTADA: funções/coluna/trigger e a
#             policy anterior voltam; nada fica pela metade.
#
# Prova de banco no Postgres descartável, sem tocar no banco real.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261012124904_followup_runtime_fila_execucoes.sql"
postgres_image="${FOLLOWUP_RUNTIME_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-followup-runtime-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-followup-runtime-test-[0-9]+$ ]]; then
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
as_role() {
  local role="$1" jwt="$2" sql="$3"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $role; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
as_user() { as_role authenticated "$1" "$2"; }
as_service() { as_role service_role '{"role":"service_role"}' "$1"; }

expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_value_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_ok_as() { local l="$1" j="$2" s="$3"; as_user "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso"; printf '[PASS] %s\n' "$l"; }
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_ok_service() { local l="$1" s="$2"; as_service "$s" >/dev/null || fail "$l: service_role deveria ter sucesso"; printf '[PASS] %s\n' "$l"; }
expect_value_service() {
  local l="$1" e="$2" s="$3" a
  a="$(as_service "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_error_service() {
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(as_service "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: service_role deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ---------------------------------------------------------------------------
# Estado ANTERIOR, fiel ao canônico (helpers reais + tabelas + policy antiga)
# ---------------------------------------------------------------------------
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role text DEFAULT 'agent',
  is_active boolean DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text
);
CREATE TABLE public.queue_members (
  queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  PRIMARY KEY (queue_id, profile_id)
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id)
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('agent', 'contact')),
  content text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.followup_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_event text NOT NULL,
  is_active boolean DEFAULT true,
  whatsapp_connection_id uuid,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.followup_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.followup_sequences(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  delay_hours integer NOT NULL,
  message_template text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.followup_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.followup_sequences(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  current_step integer DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  next_step_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $f$ SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1; $f$;
GRANT EXECUTE ON FUNCTION public.get_profile_id_for_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $f$ SELECT id FROM public.profiles WHERE user_id = _user_id; $f$;
GRANT EXECUTE ON FUNCTION public.get_visible_agent_ids(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $f$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
    );
  $f$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $f$
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
      );
  $f$;
GRANT EXECUTE ON FUNCTION public.is_contact_visible_to_user(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.followup_executions ENABLE ROW LEVEL SECURITY;
-- policy ANTIGA (canônica) de SELECT: desvia por contacts.assigned_to
CREATE POLICY "Authenticated can view followup executions" ON public.followup_executions FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
    OR public.is_admin_or_supervisor(auth.uid())
  );
CREATE POLICY "Admins can manage followup executions" ON public.followup_executions FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_executions TO anon, authenticated, service_role;
GRANT SELECT ON public.followup_sequences, public.followup_steps TO authenticated;
GRANT SELECT ON public.contacts TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT ON public.messages TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.messages;
DELETE FROM public.followup_executions;
DELETE FROM public.followup_steps;
DELETE FROM public.followup_sequences;
DELETE FROM public.user_roles;
DELETE FROM public.contacts;
DELETE FROM public.queue_members;
DELETE FROM public.queues;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, user_id, role, is_active) VALUES
  ('a0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'agent', true), -- ADMIN (user_roles)
  ('a0000000-0000-0000-0000-0000000000b2', '22222222-2222-2222-2222-222222222222', 'agent', true), -- ATILA (dono do contato)
  ('a0000000-0000-0000-0000-0000000000c3', '33333333-3333-3333-3333-333333333333', 'agent', true), -- DORA (outro agente)
  ('a0000000-0000-0000-0000-0000000000d4', '44444444-4444-4444-4444-444444444444', 'agent', true); -- EVA (sem relacao)

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin');

INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
  ('c0000000-0000-0000-0000-0000000000a1', 'Contato do Atila', '+551100000001', 'a0000000-0000-0000-0000-0000000000b2'),
  ('c0000000-0000-0000-0000-0000000000b2', 'Contato da Dora', '+551100000002', 'a0000000-0000-0000-0000-0000000000c3');

INSERT INTO public.followup_sequences (id, name, trigger_event, is_active) VALUES
  ('50000000-0000-0000-0000-0000000000a1', 'Boas-vindas', 'contact_created', true),
  ('50000000-0000-0000-0000-0000000000b2', 'Desativada', 'contact_created', false);

INSERT INTO public.followup_steps (sequence_id, step_order, delay_hours, message_template) VALUES
  ('50000000-0000-0000-0000-0000000000a1', 1, 2, 'Oi {nome}!'),
  ('50000000-0000-0000-0000-0000000000a1', 2, 24, 'Ainda por aqui?'),
  ('50000000-0000-0000-0000-0000000000b2', 1, 1, 'Nunca dispara');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ATILA='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
DORA='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
EVA='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'
ADM='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'

C_ATILA='c0000000-0000-0000-0000-0000000000a1'
C_DORA='c0000000-0000-0000-0000-0000000000b2'
SEQ_OK='50000000-0000-0000-0000-0000000000a1'
SEQ_OFF='50000000-0000-0000-0000-0000000000b2'
SEQ_GHOST='50000000-0000-0000-0000-0000000000ff'
P_ATILA='a0000000-0000-0000-0000-0000000000b2'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_error_as 'A.1 (DEFEITO) enroll_followup nao existe: nao ha fila de execucoes' \
  'does not exist' "$ATILA" "SELECT public.enroll_followup('$C_ATILA','$SEQ_OK');"
expect_error_as 'A.2 (DEFEITO) due_followups nao existe: o runner nao tem o que consumir' \
  'does not exist' "$ATILA" "SELECT * FROM public.due_followups(10);"

# admin insere direto um status invalido: a tabela aceita QUALQUER texto (sem CHECK)
expect_ok_as 'A.3 (DEFEITO) admin grava status invalido: nao ha CHECK de vocabulario' \
  "$ADM" "INSERT INTO public.followup_executions (sequence_id, contact_id, status) VALUES ('$SEQ_OK','$C_ATILA','qualquer_coisa');"
expect_value 'A.4 a linha com status invalido ficou gravada' '1' \
  "SELECT count(*) FROM public.followup_executions WHERE status='qualquer_coisa';"
expect_value 'A.5 (DEFEITO) nao existe a coluna reason (motivo)' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_name='followup_executions' AND column_name='reason';"
psql_sql "DELETE FROM public.followup_executions;" >/dev/null

printf '\n============ BLOCO B — migration aplicada ============\n'

# linha legada (status 'pending') ANTES da migration, para provar o backfill
psql_sql "INSERT INTO public.followup_executions (sequence_id, contact_id, current_step, status) VALUES ('$SEQ_OK','$C_ATILA',1,'pending');" >/dev/null
psql_file "$migration" >/dev/null

expect_value 'B.1 backfill: status legado pending -> pendente' '1' \
  "SELECT count(*) FROM public.followup_executions WHERE status='pendente';"
expect_value 'B.2 backfill: valor legado preservado no motivo (rollback exato)' 'status_legado:pending' \
  "SELECT reason FROM public.followup_executions WHERE status='pendente';"
psql_sql "DELETE FROM public.followup_executions;" >/dev/null

# --- enroll ---
EID="$(as_user "$ATILA" "SELECT public.enroll_followup('$C_ATILA','$SEQ_OK')->>'execution_id';" | tail -n1)"
[[ "$EID" =~ ^[0-9a-f-]{36}$ ]] || fail "B.3 enroll nao devolveu execution_id: $EID"
printf '[PASS] %s\n' 'B.3 atendente do contato matricula o contato e recebe execution_id'
expect_value 'B.4 execucao nasceu pendente, no 1o passo' 'pendente|1' \
  "SELECT status||'|'||current_step FROM public.followup_executions WHERE id='$EID';"
expect_value 'B.5 proxima execucao = agora + delay do 1o passo (2h)' 't' \
  "SELECT (next_step_at BETWEEN now() + interval '119 minutes' AND now() + interval '121 minutes') FROM public.followup_executions WHERE id='$EID';"

expect_error_as 'B.6 agente de outro contato nao matricula contato alheio' \
  'not_authorized' "$DORA" "SELECT public.enroll_followup('$C_ATILA','$SEQ_OK');"
expect_error_as 'B.7 contato inexistente nao autoriza (sem vazar existencia)' \
  'not_authorized' "$ATILA" "SELECT public.enroll_followup('c0000000-0000-0000-0000-0000000000ff','$SEQ_OK');"
expect_error_as 'B.8 sequencia inativa e recusada' \
  'sequence_not_available' "$ATILA" "SELECT public.enroll_followup('$C_ATILA','$SEQ_OFF');"
expect_error_as 'B.9 sequencia inexistente devolve o MESMO erro (sem oraculo)' \
  'sequence_not_available' "$ATILA" "SELECT public.enroll_followup('$C_ATILA','$SEQ_GHOST');"

# --- RLS de SELECT ---
expect_value_as 'B.10 o atendente do contato ve a execucao' '1' "$ATILA" \
  "SELECT count(*) FROM public.followup_executions WHERE id='$EID';"
expect_value_as 'B.11 outro agente NAO ve a execucao' '0' "$DORA" \
  "SELECT count(*) FROM public.followup_executions WHERE id='$EID';"
expect_value_as 'B.12 staff (admin) ve a execucao' '1' "$ADM" \
  "SELECT count(*) FROM public.followup_executions WHERE id='$EID';"
expect_value 'B.13 anon NAO ve execucao nenhuma (RLS nega por padrao)' '0' \
  "SET ROLE anon; SELECT set_config('request.jwt.claims', '{\"role\":\"anon\"}', false); SELECT count(*) FROM public.followup_executions;"

# --- status CHECK ---
expect_error_as 'B.14 CHECK barra status fora do vocabulario' \
  'followup_executions_status_check' "$ADM" \
  "INSERT INTO public.followup_executions (sequence_id, contact_id, status) VALUES ('$SEQ_OK','$C_ATILA','qualquer_coisa');"

set +e
anon_out="$(psql_sql "SET ROLE anon; SELECT set_config('request.jwt.claims', '{\"role\":\"anon\"}', false); SELECT public.enroll_followup('$C_ATILA','$SEQ_OK');" 2>&1)"; anon_st=$?
set -e
(( anon_st == 0 )) && { printf '%s\n' "$anon_out" >&2; fail 'B.14b anon nao deveria chamar enroll_followup'; }
[[ "$anon_out" == *'permission denied'* ]] || { printf '%s\n' "$anon_out" >&2; fail 'B.14b esperava permission denied para anon'; }
printf '[PASS] %s\n' 'B.14b anon nao executa enroll_followup (ACL por assinatura)'

# --- due_followups: so service_role ---
expect_error_as 'B.15 authenticated NAO consome due_followups (ACL nega antes do gate)' \
  'permission denied' "$ATILA" "SELECT * FROM public.due_followups(10);"
expect_value_service 'B.16 due_followups ainda vazio (next_step_at no futuro)' '0' \
  "SELECT count(*) FROM public.due_followups(10);"
psql_sql "UPDATE public.followup_executions SET next_step_at = now() - interval '1 minute' WHERE id='$EID';" >/dev/null
expect_value_service 'B.17 service_role ve a execucao vencida' "$EID" \
  "SELECT id FROM public.due_followups(10) LIMIT 1;"
expect_ok_service 'B.18 service_role consome a fila vencida' "SELECT count(*) FROM public.due_followups(50);"
expect_value_service 'B.19 limite respeitado (limit 0 -> 1 linha, nunca 0)' '1' \
  "SELECT count(*) FROM public.due_followups(0);"

# --- complete ---
expect_error_as 'B.20 outro agente nao conclui execucao alheia (mesmo erro de inexistente)' \
  'execution_not_found' "$DORA" "SELECT public.complete_followup('$EID');"
expect_error_as 'B.21 id inexistente devolve o MESMO erro' \
  'execution_not_found' "$ATILA" "SELECT public.complete_followup('00000000-0000-0000-0000-0000000000ff');"
expect_ok_as 'B.22 atendente conclui a execucao' "$ATILA" "SELECT public.complete_followup('$EID');"
expect_value 'B.23 status concluido e completed_at gravado' 'concluido|true' \
  "SELECT status||'|'||(completed_at IS NOT NULL) FROM public.followup_executions WHERE id='$EID';"
expect_error_as 'B.24 concluir de novo e recusado (nao esta aberta)' \
  'execution_not_open' "$ATILA" "SELECT public.complete_followup('$EID');"

# --- cancel ---
EID2="$(as_user "$ATILA" "SELECT public.enroll_followup('$C_ATILA','$SEQ_OK')->>'execution_id';" | tail -n1)"
expect_error_as 'B.25 nao-autorizado nao cancela' \
  'execution_not_found' "$EVA" "SELECT public.cancel_followup('$EID2');"
expect_ok_as 'B.26 atendente cancela com motivo' "$ATILA" "SELECT public.cancel_followup('$EID2','sem_interesse');"
expect_value 'B.27 cancelado e motivo gravado' 'cancelado|sem_interesse' \
  "SELECT status||'|'||reason FROM public.followup_executions WHERE id='$EID2';"

# --- gatilho: resposta do contato cancela os passos seguintes ---
EID3="$(as_user "$ATILA" "SELECT public.enroll_followup('$C_ATILA','$SEQ_OK')->>'execution_id';" | tail -n1)"
EID4="$(as_user "$DORA" "SELECT public.enroll_followup('$C_DORA','$SEQ_OK')->>'execution_id';" | tail -n1)"
# mensagem do AGENTE nao cancela
psql_sql "INSERT INTO public.messages (contact_id, sender, content) VALUES ('$C_ATILA','agent','resposta do agente');" >/dev/null
expect_value 'B.28 mensagem do AGENTE nao cancela o follow-up' 'pendente' \
  "SELECT status FROM public.followup_executions WHERE id='$EID3';"
# mensagem do CONTATO cancela os pendentes daquele contato
psql_sql "INSERT INTO public.messages (contact_id, sender, content) VALUES ('$C_ATILA','contact','oi');" >/dev/null
expect_value 'B.29 resposta do CONTATO cancela o follow-up do contato' 'cancelado|resposta_do_contato' \
  "SELECT status||'|'||reason FROM public.followup_executions WHERE id='$EID3';"
expect_value 'B.30 o follow-up de OUTRO contato segue pendente' 'pendente' \
  "SELECT status FROM public.followup_executions WHERE id='$EID4';"

# --- ACL por assinatura ---
expect_value 'B.31 EXECUTE de enroll/complete/cancel concedido a authenticated' '3' \
  "SELECT count(*) FROM information_schema.routine_privileges WHERE grantee='authenticated' AND routine_name IN ('enroll_followup','complete_followup','cancel_followup');"
expect_value 'B.32 due_followups negado a authenticated e concedido a service_role' '1|0' \
  "SELECT (SELECT count(*) FROM information_schema.routine_privileges WHERE grantee='service_role' AND routine_name='due_followups')||'|'||(SELECT count(*) FROM information_schema.routine_privileges WHERE grantee='authenticated' AND routine_name='due_followups');"

printf '\n============ BLOCO C — o Rollback da migration EXECUTA ============\n'
rollback_sql="$(awk '/^-- Rollback \(SQL executável, na ordem\):/{f=1;next} f&&/^--$/{exit} f{sub(/^--   /,"");print}' "$migration")"
[[ -n "$rollback_sql" ]] || fail 'C.0 bloco -- Rollback (SQL executável, na ordem): vazio'
psql_sql "$rollback_sql" >/dev/null
expect_value 'C.1 as 4 RPCs sumiram no rollback' '0' \
  "SELECT count(*) FROM pg_proc WHERE proname IN ('enroll_followup','complete_followup','cancel_followup','due_followups');"
expect_value 'C.2 a coluna reason sumiu' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_name='followup_executions' AND column_name='reason';"
expect_value 'C.3 o CHECK de status sumiu' '0' \
  "SELECT count(*) FROM pg_constraint WHERE conname='followup_executions_status_check';"
expect_value 'C.4 o gatilho sumiu' '0' \
  "SELECT count(*) FROM pg_trigger WHERE tgname='trg_followup_cancel_on_inbound';"
expect_value 'C.5 o default voltou para pending' "'pending'::text" \
  "SELECT pg_get_expr(adbin, adrelid) FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE a.attrelid='public.followup_executions'::regclass AND a.attname='status';"
expect_value 'C.6 a policy antiga de SELECT voltou a existir' '1' \
  "SELECT count(*) FROM pg_policies WHERE tablename='followup_executions' AND policyname='Authenticated can view followup executions';"

printf '\nPASS: followup-runtime — fila de execucoes (enroll/complete/cancel/due) com autorizacao\n'
printf 'por visibilidade de contato, RLS de SELECT conferida por papel real, vocabulario de status\n'
printf 'com CHECK, backfill do legado, gatilho de resposta do contato e Rollback executado.\n'
