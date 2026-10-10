#!/usr/bin/env bash
# ==================================================================
# migratioREPLAY · gate de REPLAY da cadeia de migrations
# ==================================================================
# POR QUE EXISTE
#   `supabase/migrations` deixou de ser replaysavel em ordem de versao e nenhum
#   guard percebeu: `check-migration-drift.mjs` compara arquivo x ledger (e um
#   pin `ledger-divergence/pinned-replay` faz a divergencia PASSAR de proposito),
#   os testes .test.sh montam fixtures a mao e nunca aplicam a cadeia inteira.
#   Sintoma real: `20260929140000` (F1) faz DROP+CREATE de public.search_contacts
#   com 23 colunas de retorno; `20260929370000` reemite a MESMA funcao com as 17
#   antigas -> SQLSTATE 42P13. Em ambiente novo o arquivo aborta INTEIRO (uma
#   transacao por arquivo, como `supabase db push`), derrubando `deleted_at` e a
#   exclusao logica junto.
#
# O QUE FAZ
#   1. sobe um PostgreSQL descartavel na MESMA major da producao;
#   2. aplica o prelude da plataforma (schemas auth/storage/realtime nao vem do repo);
#   3. aplica TODAS as supabase/migrations/*.sql em ordem de versao, UMA TRANSACAO
#      POR ARQUIVO, SEM parar no primeiro erro, e coleta todos os SQLSTATE;
#   4. falha se aparecer versao quebrada FORA da allowlist, se uma versao da
#      allowlist voltar a passar (ratchet) ou se a pos-condicao de contrato falhar.
#
# USO (mesmo padrao dos outros testes de banco do repo):
#   bash scripts/db-audit/retry-disposable-postgres-test.sh \
#     bash scripts/db-audit/migration-replay.test.sh
#
# ENV
#   MIGRATION_REPLAY_POSTGRES_IMAGE  (default: public.ecr.aws/supabase/postgres:17.6.1.159)
#   MIGRATION_REPLAY_STORAGE_IMAGE   (default: public.ecr.aws/supabase/storage-api:v1.73.1)
#   MIGRATION_REPLAY_ALLOWLIST       (default: scripts/db-audit/migration-replay-allowlist.txt)
#   MIGRATION_REPLAY_MIGRATIONS_DIR  (default: supabase/migrations)
#   MIGRATION_REPLAY_KEEP=1          (nao remove o container ao final)
set -uo pipefail

PG_IMAGE="${MIGRATION_REPLAY_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159}"
STORAGE_IMAGE="${MIGRATION_REPLAY_STORAGE_IMAGE:-public.ecr.aws/supabase/storage-api:v1.73.1}"
ALLOWLIST="${MIGRATION_REPLAY_ALLOWLIST:-scripts/db-audit/migration-replay-allowlist.txt}"
MIGDIR="${MIGRATION_REPLAY_MIGRATIONS_DIR:-supabase/migrations}"
CONTAINER="migration-replay-$$"
WORK=$(mktemp -d)
FAILS=0
pass() { printf 'PASS   %s\n' "$1"; }
fail() { printf 'FAIL   %s\n' "$1"; FAILS=$((FAILS+1)); }

cleanup() {
  if [ "${MIGRATION_REPLAY_KEEP:-0}" != "1" ]; then docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "== imagem: $PG_IMAGE"
echo "== migrations: $MIGDIR ($(find "$MIGDIR" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ') arquivos)"

# ---------- prelude da plataforma -------------------------------------------------
# auth/storage/realtime NAO vem do repo: em producao quem cria essas tabelas sao os
# proprios servicos (gotrue, storage-api, realtime) ao subir. Sem isso o replay
# mediria a ausencia do servico, nao o repo.
mkdir -p "$WORK/platform/img" "$WORK/platform/storage"
docker create --name "tmp-pg-$$" "$PG_IMAGE" >/dev/null 2>&1 \
  && docker cp "tmp-pg-$$:/docker-entrypoint-initdb.d/migrations/." "$WORK/platform/img/" >/dev/null 2>&1
docker rm -f "tmp-pg-$$" >/dev/null 2>&1 || true
docker create --name "tmp-sto-$$" "$STORAGE_IMAGE" >/dev/null 2>&1 \
  && docker cp "tmp-sto-$$:/app/migrations/tenant/." "$WORK/platform/storage/" >/dev/null 2>&1
docker rm -f "tmp-sto-$$" >/dev/null 2>&1 || true
# extensoes habilitadas por padrao em todo projeto Supabase hospedado
cat > "$WORK/platform/img/001-default-extensions.sql" <<'SQL'
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS citext  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgjwt   WITH SCHEMA extensions;
SQL

docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres \
  -v "$PWD/$MIGDIR:/migrations:ro" -v "$WORK/platform:/platform:ro" \
  "$PG_IMAGE" >/dev/null || { fail "docker run"; exit 1; }

ready=false
for _ in $(seq 1 180); do
  if [ "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null)" = healthy ] \
     && docker exec "$CONTAINER" psql -U postgres -X -At -c 'select 1' >/dev/null 2>&1; then
    sleep 8   # a imagem reinicia o servidor uma vez depois do initdb
    docker exec "$CONTAINER" psql -U postgres -X -At -c 'select 1' >/dev/null 2>&1 && { ready=true; break; }
  fi
  sleep 1
done
$ready || { fail "PostgreSQL de teste nao iniciou"; exit 1; }

docker exec -i "$CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text, name text, statements text[]);
SQL
for spec in "img:" "storage:storage"; do
  d="${spec%%:*}"; sp="${spec#*:}"; [ -d "$WORK/platform/$d" ] || continue
  while IFS= read -r p; do
    docker exec -e "PGOPTIONS=${sp:+-c search_path=$sp}" "$CONTAINER" \
      psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=0 -f "/platform/$d/$(basename "$p")" >/dev/null 2>&1
  done < <(find "$WORK/platform/$d" -maxdepth 1 -name '*.sql' | sort -V)
done
STORAGE_STATE=$(docker exec "$CONTAINER" psql -U postgres -X -At -c \
  "select count(*) from information_schema.tables where table_schema='storage' and table_name in ('buckets','objects','migrations')")
[ "$STORAGE_STATE" = "3" ] && pass "prelude: schema storage completo (3/3)" \
                           || fail "prelude: schema storage incompleto ($STORAGE_STATE/3)"

# ---------- replay resiliente da cadeia -------------------------------------------
: > "$WORK/fails.tsv"
while IFS= read -r f; do
  base=$(basename "$f"); version="${base%%_*}"
  docker exec "$CONTAINER" psql -U postgres -X -q --single-transaction \
    -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -f "/migrations/$base" > "$WORK/$base.log" 2>&1
  if [ $? -ne 0 ]; then
    st=$(sed -n 's/.*ERROR:  \([0-9A-Z]\{5\}\):.*/\1/p' "$WORK/$base.log" | head -1)
    printf '%s\t%s\t%s\n' "$version" "${st:-?????}" "$base" >> "$WORK/fails.tsv"
  fi
done < <(find "$MIGDIR" -maxdepth 1 -type f -name '*.sql' | sort)

grep -v '^#' "$ALLOWLIST" 2>/dev/null | grep -v '^[[:space:]]*$' | cut -f1 | sort -u > "$WORK/allow"
cut -f1 "$WORK/fails.tsv" | sort -u > "$WORK/quebrou"

NOVAS=$(comm -23 "$WORK/quebrou" "$WORK/allow")
SUMIRAM=$(comm -13 "$WORK/quebrou" "$WORK/allow")

echo "== replay: $(wc -l < "$WORK/fails.tsv" | tr -d ' ') arquivos falharam de $(find "$MIGDIR" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
if [ -n "$NOVAS" ]; then
  fail "migrations quebradas FORA da allowlist:"
  while IFS= read -r v; do
    line=$(grep -P "^$v\t" "$WORK/fails.tsv" | head -1)
    printf '       %s  SQLSTATE=%s  %s\n' "$v" "$(printf '%s' "$line" | cut -f2)" "$(printf '%s' "$line" | cut -f3)"
  done <<< "$NOVAS"
else
  pass "nenhuma migration quebrada fora da allowlist"
fi
if [ -n "$SUMIRAM" ]; then
  fail "estas versions estavam na allowlist e PASSARAM — remova-as da allowlist (ratchet):"
  printf '       %s\n' $SUMIRAM
else
  pass "allowlist ainda e exata (nenhuma correcao deixou de ser reconhecida)"
fi

# ---------- pos-condicao de contrato (o que o replay DEVE deixar vivo) ------------
P() { docker exec "$CONTAINER" psql -U postgres -X -At -c "$1"; }
COL=$(P "select count(*) from pg_proc where proname='search_contacts' and pg_get_function_result(oid) like '%address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint%'")
[ "$COL" = "1" ] && pass "search_contacts vive com as 6 colunas de endereco" \
                 || fail "search_contacts NAO tem as 6 colunas de endereco (rowtype final errado)"
DEL=$(P "select count(*) from information_schema.columns where table_schema='public' and table_name='contacts' and column_name='deleted_at'")
[ "$DEL" = "1" ] && pass "contacts.deleted_at existe" || fail "contacts.deleted_at NAO existe"
ERR=$(docker exec "$CONTAINER" psql -U postgres -X -v VERBOSITY=verbose -c \
  "SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111'; SELECT public.search_contacts('',NULL,NULL,NULL,NULL,NULL,'name','asc',5,0);" 2>&1 \
  | grep -c 'ERROR:  42703')
[ "$ERR" = "0" ] && pass "search_contacts executavel (sem 42703)" || fail "search_contacts levanta 42703 em runtime"
DERR=$(docker exec "$CONTAINER" psql -U postgres -X -v VERBOSITY=verbose -c \
  "SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111'; SELECT public.delete_contact(gen_random_uuid());" 2>&1 \
  | grep -c 'ERROR:  42703')
[ "$DERR" = "0" ] && pass "delete_contact executavel (sem 42703)" || fail "delete_contact levanta 42703 em runtime"

echo
if [ "$FAILS" -eq 0 ]; then echo "TODOS OS CHECKS DE REPLAY PASSARAM"; exit 0; fi
echo "REPLAY REPROVOU: $FAILS check(s)"; exit 1
