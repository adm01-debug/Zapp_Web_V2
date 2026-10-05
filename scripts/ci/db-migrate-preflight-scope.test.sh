#!/usr/bin/env bash
# Prova a decisao de escopo do preflight do db-migrate.yml com ledger simulado.
#
# O que esta sendo preso aqui: o dispatch do dia publica um LOTE de migrations
# (a branch ja chegou com 8 novas), mas o preflight original so aceitava uma
# ausente ou dois bundles fixos de setembro — o caminho oficial falhava com
# missing_count=8. A decisao agora vive em db-migrate-preflight-scope.sh e este
# arquivo exercita cada braco sem banco: os "ledgers" sao arquivos de texto.
#
# Nao precisa de docker nem de Postgres — roda em qualquer runner.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="$repo_root/scripts/ci/db-migrate-preflight-scope.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
passed=0

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

local_file="$tmp/local"
remote_file="$tmp/remote"
stderr_file="$tmp/stderr"

# run_scope <var-saida> <var-status> <args...>: roda o script capturando stdout,
# status e stderr sem derrubar o teste (set +e local).
run_scope() {
  local out_var="$1" st_var="$2" _out _st
  shift 2
  set +e
  _out="$(bash "$script" --local "$local_file" --remote "$remote_file" "$@" 2>"$stderr_file")"
  _st=$?
  set -e
  printf -v "$out_var" '%s' "$_out"
  printf -v "$st_var" '%s' "$_st"
}

assert_out() { # <saida> <par k=v esperado>
  printf '%s\n' "$1" | grep -Fxq "$2" || fail "esperava '$2' na saida, recebi: $1"
}

# ── Cenario 1: uma version ausente, sem lote — comportamento antigo ─────────
printf '%s\n' 20261001000000 > "$remote_file"
printf '%s\n' 20261001000000 20261001120000 > "$local_file"

run_scope out st --alvo 20261001120000 --lote ''
if [ "$st" != "0" ]; then
  cat "$stderr_file" >&2
  fail "alvo unico deveria passar"
fi
assert_out "$out" 'needs_apply=true'
assert_out "$out" 'apply_bundle=false'
assert_out "$out" 'modo=alvo-unico'
assert_out "$out" 'esperados=20261001120000'
passed=$((passed + 1))
printf '[PASS] alvo unico preservado (needs_apply=true, apply_bundle=false, modo=alvo-unico)\n'

# ── Cenario 2: lote de 8 versions ausentes aceito ────────────────────────────
LOTE_8="20261001120000,20261001130000,20261001140000,20261001150000,20261001160000,20261001170000,20261001180000,20261001190000"
printf '%s\n' 20261001000000 > "$remote_file"
printf '%s\n' 20261001000000 20261001120000 20261001130000 20261001140000 \
  20261001150000 20261001160000 20261001170000 20261001180000 20261001190000 \
  > "$local_file"

run_scope out st --alvo 20261001190000 --lote "$LOTE_8"
if [ "$st" != "0" ]; then
  cat "$stderr_file" >&2
  fail "lote de 8 deveria passar"
fi
assert_out "$out" 'needs_apply=true'
assert_out "$out" 'apply_bundle=true'
assert_out "$out" 'modo=lote'
assert_out "$out" "esperados=$LOTE_8"
passed=$((passed + 1))
printf '[PASS] lote de 8 aceito (modo=lote, esperados=conjunto exato)\n'

# ── Cenario 3: lote divergente do conjunto ausente falha com mensagem clara ──
LOTE_DIVERGENTE="20261001120000,20261001130000,20261001140000,20261001150000,20261001160000,20261001170000,20261001190000"
run_scope out st --alvo 20261001190000 --lote "$LOTE_DIVERGENTE"
if [ "$st" = "0" ]; then
  fail "lote divergente nao pode passar (falta uma version ausente na lista)"
fi
grep -q 'nao corresponde exatamente as versions ausentes' "$stderr_file" \
  || fail "lote divergente precisa falhar com mensagem clara; stderr: $(cat "$stderr_file")"
passed=$((passed + 1))
printf '[PASS] lote divergente bloqueado com mensagem clara\n'

# ── Cenario 4: lote fora de ordem falha ──────────────────────────────────────
LOTE_DESORDENADO="20261001120000,20261001140000,20261001130000,20261001150000,20261001160000,20261001170000,20261001180000,20261001190000"
run_scope out st --alvo 20261001190000 --lote "$LOTE_DESORDENADO"
if [ "$st" = "0" ]; then
  fail "lote fora de ordem nao pode passar"
fi
grep -q 'ordem estritamente crescente' "$stderr_file" \
  || fail "lote fora de ordem precisa apontar o problema; stderr: $(cat "$stderr_file")"
passed=$((passed + 1))
printf '[PASS] lote fora de ordem bloqueado\n'

# ── Cenario 5: alvo que nao e a ultima version do lote falha ─────────────────
run_scope out st --alvo 20261001180000 --lote "$LOTE_8"
if [ "$st" = "0" ]; then
  fail "alvo diferente da ultima version do lote nao pode passar"
fi
grep -q 'precisa ser a ultima version da lista' "$stderr_file" \
  || fail "mensagem esperada sobre a ultima version; stderr: $(cat "$stderr_file")"
passed=$((passed + 1))
printf '[PASS] alvo fora da ponta do lote bloqueado\n'

# ── Cenario 6: ledger remoto com version sem arquivo local continua bloqueado ─
printf '%s\n' 20261001000000 20261001010000 > "$remote_file"
printf '%s\n' 20261001000000 20261001120000 > "$local_file"
run_scope out st --alvo 20261001120000 --lote ''
if [ "$st" = "0" ]; then
  fail "version remota sem arquivo local nao pode passar"
fi
grep -q 'versions sem arquivo local' "$stderr_file" \
  || fail "mensagem de remote-only esperada; stderr: $(cat "$stderr_file")"
passed=$((passed + 1))
printf '[PASS] ledger remoto com extra bloqueado\n'

# ── Cenario 7: nada ausente e alvo ja registrado — needs_apply=false ─────────
printf '%s\n' 20261001000000 20261001120000 > "$remote_file"
printf '%s\n' 20261001000000 20261001120000 > "$local_file"
run_scope out st --alvo 20261001120000 --lote ''
if [ "$st" != "0" ]; then
  cat "$stderr_file" >&2
  fail "alvo ja aplicado deveria passar com needs_apply=false"
fi
assert_out "$out" 'needs_apply=false'
assert_out "$out" 'apply_bundle=false'
assert_out "$out" 'modo=ja-aplicado'
assert_out "$out" 'esperados='
passed=$((passed + 1))
printf '[PASS] alvo ja registrado vira needs_apply=false (modo=ja-aplicado, esperados vazio)\n'

printf 'db-migrate-preflight-scope: %s cenarios aprovados.\n' "$passed"
