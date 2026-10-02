#!/usr/bin/env bash
set -euo pipefail

TEST_ROOT=$(mktemp -d /tmp/zapp-gen-types-test.XXXXXX)
trap 'rm -rf -- "$TEST_ROOT"' EXIT

# ---------- Caso 1: preserva linhas internas e normaliza o EOF ----------
mkdir -p "$TEST_ROOT/bin"
cat > "$TEST_ROOT/bin/supabase" <<'FAKE_SUPABASE'
#!/usr/bin/env sh
printf 'export type Example = {\n\n  id: string\n}\n\n\n'
FAKE_SUPABASE
chmod +x "$TEST_ROOT/bin/supabase"

OUTPUT="$TEST_ROOT/types.ts"
PATH="$TEST_ROOT/bin:$PATH" \
  DESTINO_URL='postgresql://fixture.invalid/postgres' \
  CI= \
  bash scripts/db-audit/gen-types.sh "$OUTPUT" >/dev/null

EXPECTED="$TEST_ROOT/expected.ts"
printf 'export type Example = {\n\n  id: string\n}\n' > "$EXPECTED"

cmp "$EXPECTED" "$OUTPUT"

LAST_TWO_BYTES=$(tail -c 2 "$OUTPUT" | od -An -t x1 | tr -d ' \n')
if [ "$LAST_TWO_BYTES" = '0a0a' ]; then
  echo 'ERRO: gen-types.sh deixou linha vazia extra no EOF.' >&2
  exit 1
fi

# ---------- Caso 2: saturacao transitoria do banco -> retry ----------
# Regressao medida em 02/10/2026: nos minutos em que o Postgres registra rajadas
# de `statement timeout`, o handshake do pgbouncer ate o banco nao completa e a
# CLI morre com "Error: timeout exceeded when trying to connect" — mesmo com
# tudo saudavel. O script deve retentar em vez de deixar o gate vermelho.
FLAKY_BIN="$TEST_ROOT/bin-flaky"
mkdir -p "$FLAKY_BIN"
cat > "$FLAKY_BIN/supabase" <<'FAKE_FLAKY'
#!/usr/bin/env sh
n=$(cat "$STUB_COUNT_FILE" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$STUB_COUNT_FILE"
if [ "$n" -le "${STUB_FAILS_UNTIL:-2}" ]; then
  echo 'Connecting to 127.0.0.1 45907' >&2
  echo 'Failed to end the connection on error: { this: PostgresMetaFunctions { query: [AsyncFunction: query] }, end: undefined }' >&2
  echo 'Error: timeout exceeded when trying to connect' >&2
  exit 1
fi
printf 'export type Flaky = {\n  ok: boolean\n}\n'
FAKE_FLAKY
chmod +x "$FLAKY_BIN/supabase"

COUNT_FILE="$TEST_ROOT/flaky.count"
: > "$COUNT_FILE"
OUTPUT_FLAKY="$TEST_ROOT/types-flaky.ts"

PATH="$FLAKY_BIN:$PATH" \
  DESTINO_URL='postgresql://fixture.invalid/postgres' \
  GEN_TYPES_RETRY_DELAY_S=0 \
  STUB_COUNT_FILE="$COUNT_FILE" \
  CI= \
  bash scripts/db-audit/gen-types.sh "$OUTPUT_FLAKY" >/dev/null 2>"$TEST_ROOT/flaky.err"

CHAMADAS=$(cat "$COUNT_FILE")
if [ "$CHAMADAS" != '3' ]; then
  echo "ERRO: esperava 3 chamadas ao supabase (2 falhas + 1 sucesso), houve ${CHAMADAS}." >&2
  exit 1
fi

EXPECTED_FLAKY="$TEST_ROOT/expected-flaky.ts"
printf 'export type Flaky = {\n  ok: boolean\n}\n' > "$EXPECTED_FLAKY"
cmp "$EXPECTED_FLAKY" "$OUTPUT_FLAKY"

# O log do CI precisa deixar rastro de que houve retry (transparencia).
if ! grep -q 'nova tentativa' "$TEST_ROOT/flaky.err"; then
  echo 'ERRO: o retry nao registrou aviso no stderr.' >&2
  exit 1
fi

# ---------- Caso 3: falha persistente NAO pode ser mascarada ----------
COUNT_PERSIST="$TEST_ROOT/persist.count"
: > "$COUNT_PERSIST"
if PATH="$FLAKY_BIN:$PATH" \
     DESTINO_URL='postgresql://fixture.invalid/postgres' \
     GEN_TYPES_RETRY_DELAY_S=0 \
     STUB_COUNT_FILE="$COUNT_PERSIST" \
     STUB_FAILS_UNTIL=99 \
     CI= \
     bash scripts/db-audit/gen-types.sh "$TEST_ROOT/types-persist.ts" >/dev/null 2>&1; then
  echo 'ERRO: gen-types.sh devolveu sucesso com o supabase falhando sempre.' >&2
  exit 1
fi

CHAMADAS_PERSIST=$(cat "$COUNT_PERSIST")
if [ "$CHAMADAS_PERSIST" != '3' ]; then
  echo "ERRO: esperava 3 tentativas na falha persistente, houve ${CHAMADAS_PERSIST}." >&2
  exit 1
fi

echo 'PASS: gen-types.sh preserva linhas internas e normaliza o EOF.'
echo 'PASS: gen-types.sh retenta em falha transitoria (2 falhas + 1 sucesso) e nao mascara falha persistente.'
