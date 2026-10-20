#!/usr/bin/env bash
set -euo pipefail

TEST_ROOT=$(mktemp -d /tmp/zapp-gen-types-test.XXXXXX)
trap 'rm -rf -- "$TEST_ROOT"' EXIT

mkdir -p "$TEST_ROOT/bin"
cat > "$TEST_ROOT/bin/supabase" <<'FAKE_SUPABASE'
#!/usr/bin/env sh
printf 'export type Example = {\n\n  id: string\n}\n\n\n'
FAKE_SUPABASE
chmod +x "$TEST_ROOT/bin/supabase"

OUTPUT="$TEST_ROOT/types.ts"
PATH="$TEST_ROOT/bin:$PATH" \
  DESTINO_URL='postgresql://fixture.invalid/postgres' \
  bash scripts/db-audit/gen-types.sh "$OUTPUT" >/dev/null

EXPECTED="$TEST_ROOT/expected.ts"
printf 'export type Example = {\n\n  id: string\n}\n' > "$EXPECTED"

cmp "$EXPECTED" "$OUTPUT"

LAST_TWO_BYTES=$(tail -c 2 "$OUTPUT" | od -An -t x1 | tr -d ' \n')
if [ "$LAST_TWO_BYTES" = '0a0a' ]; then
  echo 'ERRO: gen-types.sh deixou linha vazia extra no EOF.' >&2
  exit 1
fi

echo 'PASS: gen-types.sh preserva linhas internas e normaliza o EOF.'
