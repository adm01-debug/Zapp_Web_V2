#!/usr/bin/env bash
# Contrato do drop do indice redundante idx_messages_external_id (performance da matriz
# docs/ia/IA-004-matriz-autorizacao.md).
#
# Causa: messages tem tres indices sobre a mesma coluna external_id. O simples
# (idx_messages_external_id) nao tem contrapartida de leitura -- toda busca por
# external_id NAO nulo e atendida pelo indice unico parcial messages_external_id_uq, a
# varredura de entrega (external_id IS NULL) por idx_messages_delivery_claimable e a
# deduplicacao por ux_messages_dedup. Ele custa uma escrita de indice por linha em
# messages, a tabela mais quente do sistema.
#
# BLOCO A (antes): os tres indices existem; a unicidade de external_id ja e garantida
#   pelo indice unico (indice simples nao garante nada).
# BLOCO B (depois): o simples sumiu; os dois UNIQUE seguem no lugar e continuam
#   recusando duplicata com 23505; as buscas por external_id e por
#   (conexao, external_id, remetente) seguem servidas por indice; nenhuma linha de
#   messages foi perdida.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930230000_drop_redundant_messages_external_id_index.sql"
postgres_image="${DROP_EXTID_INDEX_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-drop-extid-index-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-drop-extid-index-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

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
# Existe indice com esse nome (relkind 'i') no schema public?
index_count() { psql_sql "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='$1' AND c.relkind='i'"; }
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

# Reproduz o estado de messages relevante para a mudanca: a coluna external_id com os
# tres indices que producao tem hoje (medidos no banco canonico em 30/09/2026).
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_connection_id uuid,
  external_id text,
  sender text
);
CREATE INDEX idx_messages_external_id ON public.messages USING btree (external_id);
CREATE UNIQUE INDEX messages_external_id_uq ON public.messages USING btree (external_id)
  WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX ux_messages_dedup ON public.messages USING btree
  (whatsapp_connection_id, external_id, sender);
INSERT INTO public.messages (whatsapp_connection_id, external_id, sender)
VALUES ('e0000000-0000-0000-0000-000000000001', 'EXT-1', 'contact');
ANALYZE public.messages;
SQL

psql_file "$tmp_dir/pre.sql"

conn='e0000000-0000-0000-0000-000000000001'

echo '-- BLOCO A: ANTES da migration ------------------------------------------------------'

expect_index_exists 'A1 o indice redundante idx_messages_external_id existe' idx_messages_external_id 1
expect_index_exists 'A2 o indice unico parcial messages_external_id_uq existe' messages_external_id_uq 1
expect_index_exists 'A3 ux_messages_dedup existe' ux_messages_dedup 1
expect_error 'A4 external_id duplicado ja e recusado hoje (23505 pelo indice unico -- o indice simples nao garante nada)' \
  '23505' "INSERT INTO public.messages (whatsapp_connection_id, external_id, sender) VALUES ('$conn', 'EXT-1', 'contact')"

echo
echo '-- Aplicando a migration ------------------------------------------------------------'
psql_file "$migration"

echo
echo '-- BLOCO B: DEPOIS da migration ----------------------------------------------------'

expect_index_exists 'B1 o indice redundante foi removido' idx_messages_external_id 0
expect_index_exists 'B2 o indice unico parcial messages_external_id_uq permanece' messages_external_id_uq 1
expect_index_exists 'B3 ux_messages_dedup permanece' ux_messages_dedup 1
expect_value 'B4 os tres indices remanescentes de external_id/pkey estao todos presentes' '3' \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_index i ON i.indexrelid=c.oid WHERE n.nspname='public' AND i.indrelid='public.messages'::regclass AND c.relname IN ('messages_external_id_uq','ux_messages_dedup','messages_pkey')"
expect_error 'B5 duplicata de external_id continua recusada sem o indice simples (23505)' \
  '23505' "INSERT INTO public.messages (whatsapp_connection_id, external_id, sender) VALUES ('$conn', 'EXT-1', 'contact')"
expect_value 'B6 existe indice UNICO com external_id como coluna lider -- a cobertura das buscas por external_id se mantem' '1' \
  "SELECT count(*) FROM pg_index i WHERE i.indrelid='public.messages'::regclass AND i.indisunique AND i.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid='public.messages'::regclass AND a.attname='external_id')"
expect_plan_uses 'B7 a busca por external_id e resolvida por indice (nao por varredura sequencial)' \
  'Index' "SELECT id FROM public.messages WHERE external_id = 'EXT-1'"
expect_plan_uses 'B8 a busca por (conexao, external_id, remetente) segue servida por ux_messages_dedup' \
  'ux_messages_dedup' "SELECT id FROM public.messages WHERE whatsapp_connection_id = '$conn' AND external_id = 'EXT-1' AND sender = 'contact'"
expect_value 'B9 nenhuma linha de messages foi perdida' '1' 'SELECT count(*) FROM public.messages'

echo
echo '-- Reaplicando a migration (idempotencia) -------------------------------------------'
psql_file "$migration"
expect_index_exists 'B10 apos reaplicar, o indice continua ausente' idx_messages_external_id 0

printf '\n[OK] contrato do drop do indice redundante verificado\n'
