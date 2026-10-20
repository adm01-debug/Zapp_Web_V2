#!/usr/bin/env bash
# N-083 — índices de tarefas concluídas do kanban (performance da listagem de
# tarefas em src/hooks/tasks/useMyWorkItems.ts).
#
# Causa: a query de tarefas do dono filtra `created_by = X` com
# `status = done AND completed_at >= cutoff` (aba de concluídas) e ordena o
# kanban por `position` dentro do status — sem índice composto, as duas formas
# varrem a tabela inteira.
#
# BLOCO A (antes das 2 migrations novas): os dois índices NÃO existem; a tabela
#   parte do estado PRÉ-unify (sem a coluna position); o trecho da migration
#   20260928140000_tasks_unify_reminders_kanban.sql que cria position (§2,
#   extraído do arquivo com sed e aplicado de verdade) adiciona a coluna;
#   só então as 9 linhas de partida são inseridas.
# BLOCO B (depois das 2 migrations): os dois índices existem, as formas de
#   consulta da aba de concluídas e do kanban são resolvidas por eles
#   (EXPLAIN), nenhuma linha se perde, reaplicar é idempotente e o
#   `-- Rollback:` de cada migration (linha lida do arquivo com sed e
#   executada) remove o índice de verdade.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_completed="$repo_root/supabase/migrations/20261010180000_conversation_tasks_owner_status_completed_idx.sql"
migration_position="$repo_root/supabase/migrations/20261010180001_conversation_tasks_owner_status_position_idx.sql"
unify_migration="$repo_root/supabase/migrations/20260928140000_tasks_unify_reminders_kanban.sql"
# RED/GREEN manual: apontar as duas para /dev/null pula a correção e o BLOCO B
# falha (prova que o teste detecta a ausência dos índices).
migration_completed="${MIGRATION_COMPLETED_OVERRIDE:-$migration_completed}"
migration_position="${MIGRATION_POSITION_OVERRIDE:-$migration_position}"
postgres_image="${CONVERSATION_TASKS_COMPLETED_INDEX_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-tasks-completed-index-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-tasks-completed-index-test-[0-9]+$ ]]; then
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
expect_index_exists() {
  local label="$1" idx="$2" expected="$3"
  expect_value "$label" "$expected" "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='$idx' AND c.relkind='i'"
}
expect_plan_uses() {
  local label="$1" needle="$2" sql="$3" out
  out="$(psql_sql "SET enable_seqscan = off; EXPLAIN (COSTS OFF) $sql")"
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$label: plano nao usou $needle"; }
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration_completed" ]] || fail "migration nao encontrada: $migration_completed"
[[ -f "$migration_position" ]] || fail "migration nao encontrada: $migration_position"
[[ -f "$unify_migration" ]] || fail "migration da unify nao encontrada: $unify_migration"

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

# Estado PRÉ-unify: conversation_tasks sem a coluna position (nem as outras 5
# colunas que a unify §2 adiciona). A coluna position passa a existir só quando
# o trecho extraído da 20260928140000 é aplicado abaixo.
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE TABLE public.conversation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid,
  assigned_to uuid,
  status text NOT NULL DEFAULT 'backlog',
  completed_at timestamptz,
  due_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
SQL

psql_file "$tmp_dir/pre.sql"

owner_a='a0000000-0000-0000-0000-000000000001'
owner_b='a0000000-0000-0000-0000-000000000002'

echo '-- BLOCO A: ANTES das migrations ------------------------------------------------'

expect_index_exists 'A1 idx_conversation_tasks_owner_status_completed ainda nao existe' idx_conversation_tasks_owner_status_completed 0
expect_index_exists 'A2 idx_conversation_tasks_owner_status_position ainda nao existe' idx_conversation_tasks_owner_status_position 0
expect_value 'A3 a coluna position ainda nao existe (estado pre-unify)' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='conversation_tasks' AND column_name='position'"

echo
echo '-- Aplicando o trecho da unify que cria position (§2 da 20260928140000) -------------'
# A unify completa exige o schema inteiro (falha sem stubs com
# `relation "public.profiles" does not exist` no helper current_profile_id);
# o que este cartão precisa dela é a criação da coluna position, então o teste
# extrai o bloco `§2. Colunas novas` do ARQUIVO da migration e aplica de verdade.
sed -n '/-- 2. Colunas novas/,/;/p' "$unify_migration" > "$tmp_dir/unify_step2.sql"
grep -q 'ADD COLUMN IF NOT EXISTS position' "$tmp_dir/unify_step2.sql" || fail 'trecho da unify sem a criacao de position'
psql_file "$tmp_dir/unify_step2.sql"
expect_value 'A4 a coluna position foi criada pela unify (integer, NOT NULL, default 0)' 'integer|NO|0' \
  "SELECT data_type || '|' || is_nullable || '|' || column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='conversation_tasks' AND column_name='position'"

# 9 linhas cobrindo dono A (concluídas recentes/antiga/legada, todos, cancelada)
# + dono B (isolamento). Inseridas APÓS a unify criar position.
cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO public.conversation_tasks (created_by, status, completed_at, position) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'done', now() - interval '5 days', 0),
  ('a0000000-0000-0000-0000-000000000001', 'done', now() - interval '10 days', 1),
  ('a0000000-0000-0000-0000-000000000001', 'done', now() - interval '20 days', 2),
  ('a0000000-0000-0000-0000-000000000001', 'done', now() - interval '40 days', 3),
  ('a0000000-0000-0000-0000-000000000001', 'done', NULL, 4),
  ('a0000000-0000-0000-0000-000000000001', 'todo', NULL, 0),
  ('a0000000-0000-0000-0000-000000000001', 'todo', NULL, 1),
  ('a0000000-0000-0000-0000-000000000001', 'cancelled', now() - interval '2 days', 5),
  ('a0000000-0000-0000-0000-000000000002', 'done', now() - interval '3 days', 0);
ANALYZE public.conversation_tasks;
SQL

psql_file "$tmp_dir/seed.sql"
expect_value 'A5 as 9 linhas de partida estao la' '9' 'SELECT count(*) FROM public.conversation_tasks'

echo
echo '-- Aplicando as 2 migrations ----------------------------------------------------'
psql_file "$migration_completed"
psql_file "$migration_position"

echo
echo '-- BLOCO B: DEPOIS das migrations ------------------------------------------------'

expect_index_exists 'B1 idx_conversation_tasks_owner_status_completed existe' idx_conversation_tasks_owner_status_completed 1
expect_index_exists 'B2 idx_conversation_tasks_owner_status_position existe' idx_conversation_tasks_owner_status_position 1
expect_plan_uses 'B3 a aba de concluidas (dono + done + completed_at >= corte, ordem por completed_at) usa o indice de concluidas' \
  'idx_conversation_tasks_owner_status_completed' \
  "SELECT id FROM public.conversation_tasks WHERE created_by = '$owner_a' AND status = 'done' AND completed_at >= now() - interval '30 days' ORDER BY completed_at"
expect_plan_uses 'B4 o kanban (dono + status, ordem por position) usa o indice de position' \
  'idx_conversation_tasks_owner_status_position' \
  "SELECT id FROM public.conversation_tasks WHERE created_by = '$owner_a' AND status = 'todo' ORDER BY position"
expect_value 'B5 a forma do hook (30 dias + legadas sem carimbo, sem canceladas) devolve as 6 linhas do dono A' '6' \
  "SELECT count(*) FROM public.conversation_tasks WHERE created_by = '$owner_a' AND (status <> 'done' OR completed_at IS NULL OR completed_at >= now() - interval '30 days') AND status <> 'cancelled'"
expect_value 'B6 o filtro por dono isola: dono B ve so a propria concluida' '1' \
  "SELECT count(*) FROM public.conversation_tasks WHERE created_by = '$owner_b' AND (status <> 'done' OR completed_at IS NULL OR completed_at >= now() - interval '30 days') AND status <> 'cancelled'"
expect_value 'B7 nenhuma linha foi perdida' '9' 'SELECT count(*) FROM public.conversation_tasks'

echo
echo '-- Reaplicando as migrations (idempotencia) --------------------------------------'
psql_file "$migration_completed"
psql_file "$migration_position"
expect_index_exists 'B8 apos reaplicar, o indice de concluidas segue unico' idx_conversation_tasks_owner_status_completed 1
expect_index_exists 'B9 apos reaplicar, o indice de position segue unico' idx_conversation_tasks_owner_status_position 1

echo
echo '-- Rollback real (a linha -- Rollback: de cada migration) ------------------------'
# A linha executada é lida da primeira linha do ARQUIVO de cada migration,
# não um DROP escrito à mão neste teste.
rollback_completed="$(sed -n '1s/^-- Rollback: //p' "$migration_completed")"
rollback_position="$(sed -n '1s/^-- Rollback: //p' "$migration_position")"
[[ -n "$rollback_completed" ]] || fail 'migration de concluidas sem linha -- Rollback:'
[[ -n "$rollback_position" ]] || fail 'migration de position sem linha -- Rollback:'
psql_sql "$rollback_completed"
psql_sql "$rollback_position"
expect_index_exists 'B10 rollback removeu o indice de concluidas' idx_conversation_tasks_owner_status_completed 0
expect_index_exists 'B11 rollback removeu o indice de position' idx_conversation_tasks_owner_status_position 0
psql_file "$migration_completed"
psql_file "$migration_position"
expect_index_exists 'B12 reaplicar apos o rollback recria o indice de concluidas' idx_conversation_tasks_owner_status_completed 1
expect_index_exists 'B13 reaplicar apos o rollback recria o indice de position' idx_conversation_tasks_owner_status_position 1
expect_value 'B14 rollback + recriacao nao perderam linhas' '9' 'SELECT count(*) FROM public.conversation_tasks'

printf '\n[OK] N-083: indices de concluidas e de position verificados\n'
