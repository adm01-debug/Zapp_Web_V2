#!/usr/bin/env bash
# Item 164 / TC-009 (P2) + R2-DB-011 â€” "Recibos e reaÃ§Ãµes nÃ£o forÃ§am conversation_id derivado da mensagem"
# (docs/reconciliation/reports/team-chat/CODE_DATAPASE_TRUTH_TEAM_CHAT.md:148-160).
#
# Roda o MESMO roteiro no mesmo container, em dois blocos:
#   BLOCO A â€” estado ANTERIOR (defeito), fiel ao canÃ´nico de 04/10:
#             * `team_receipts_fill_conversation_id` sÃ³ preenche o cid quando ele chega NULL e sÃ³ no INSERT.
#               Um cid NÃƒO nulo e errado, mandado pelo PostgREST (`useTeamMessages.ts` manda o
#               `conversationId` do painel), Ã© gravado como veio; e o UPDATE que troca `message_id`
#               conserva o cid antigo. Como a leitura ("Conversation members can read receipts") e o
#               filtro de realtime usam a COLUNA, um recibo de mensagem do Time A passa a ser lido
#               dentro do Time B.
#             * `team_message_reactions` nÃ£o tem trigger equivalente. `useTeamMessageReactions.ts`
#               insere direto com `conversation_id: conversationId`: a reaÃ§Ã£o sume da conversa real
#               (a agregaÃ§Ã£o e o canal de realtime filtram por `conversation_id`).
#   BLOCO B â€” migration aplicada: o cid Ã© derivado INCONDICIONALMENTE da mensagem (BEFORE INSERT OR UPDATE)
#             nas duas tabelas, mensagem inexistente Ã© recusada, as linhas divergentes sÃ£o reconciliadas
#             pelo backfill, o caminho legÃ­timo (cid da prÃ³pria conversa) segue intacto e as duas
#             funÃ§Ãµes de TRIGGER terminam sem EXECUTE para authenticated/anon/PUBLIC (B.15-B.17).
#
# TEAM_CID_PRESTATE=1us o bloco B SEM aplicar a migration â€” eÃ© assim que se prova o vermelho
# (bloco A passa pelo defeito, B.1 falha). Sem a variÃ¡vel, o roteiro Ã© o normal: verde.
#
# Pre-estado fiel ao canÃ´nico de 04/10 (`pg_policies` + `pg_get_functiondef` + `pg_trigger`):
# INSERT de recibo estrito por vÃ­nculo (reconciliaÃ§Ã£o 20261003272707), leitura de recibo por
# `conversation_id`, UPDATE do recibo prÃ³prio sÃ³ para 'read', guarda de downgrade, dedup de reaÃ§Ã£o,
# `conversation_id` NOT NULL nas duas tabelas e as FKs.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261009241237_team_receipts_reactions_conversation_id_forced_v2.sql"
postgres_image="${TEAM_CID_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-team-cid-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-cid-test-[0-9]+$ ]]; then
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
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwst', false); $sql"
}
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
expect_ok_as() { local l="$1" j="$2" s="$3"; as_user "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como authenticated)"; printf '[PASS] %s\n' "$l"; }
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_error() {
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(psql_sql "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_ok() {
  local l="$1" s="$2" out st
  set +e; out="$(psql_sql "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) || { printf '%s\n' "$out" >&2; fail "$l: deveria ter sucesso"; }
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

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE CREATE SCHEMA auth;
CREATE FU9CTCUÑWF‚çV–B‚’$UEU$å2WV–BÄäuTtR7Â5D$ÄP¢2BB4TÄT5B6öÆW66R€¢çVÆÆ–b†7W'&VçE÷6WGF–ær‚w&WVW7Bæ§wBæ6Æ–Òç7V"rÂG'VR’Ârr’À¢çVÆÆ–b†7W'&VçE÷6WGF–ær‚w&WVW7Bæ§wBæ6Æ–×2rÂG'VR’Ârr“£¦§6öæ"Óãâw7V"p¢“£§WV–BBC°¤5$TDReS$5D5] auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), '''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;
GRANT USABE ON SCHEMA 