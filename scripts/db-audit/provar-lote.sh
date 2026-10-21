#!/usr/bin/env bash
# GA14/GA16: prova o lote de migrations (runtime + hash de confirmacao).
#
# Para cada versao do CSV: executa o contrato de runtime generico, valida a
# assercao historica (assert-runtime-proof.mjs, fail-closed) e coleta os shas.
# Ao final imprime o hash do lote (compose-confirm-hash.mjs) em stdout.
# Qualquer falha => exit != 0 e nada e impresso como hash.
#
# Uso: bash scripts/db-audit/provar-lote.sh "<v1,v2>" "<true|false>" "<commit>"
set -euo pipefail

VERSIONS="${1:?provar-lote.sh: versions csv ausente}"
NEEDS_APPLY="${2:?provar-lote.sh: needs_apply ausente}"
COMMIT_SHA="${3:?provar-lote.sh: commit ausente}"

RUNTIME_SHAS=""
ARQUIVO_SHAS=""
for v in $(printf '%s' "$VERSIONS" | tr ',' ' '); do
  RUNTIME=$(node scripts/db-audit/run-runtime-contract.mjs "$v")
  printf '%s\n' "$RUNTIME"
  RUNTIME_JSON="$RUNTIME" TARGET_VERSION="$v" NEEDS_APPLY="$NEEDS_APPLY" APPLY_BUNDLE=false \
    node scripts/db-audit/assert-runtime-proof.mjs
  RS=$(printf '%s' "$RUNTIME" | node scripts/db-audit/proof-sha.mjs)
  ARQ=$(ls supabase/migrations/"${v}"_*.sql | head -1)
  AS=$(sha256sum "$ARQ" | cut -d' ' -f1)
  if [ -z "$RUNTIME_SHAS" ]; then
    RUNTIME_SHAS="$RS"
    ARQUIVO_SHAS="$AS"
  else
    RUNTIME_SHAS="$RUNTIME_SHAS,$RS"
    ARQUIVO_SHAS="$ARQUIVO_SHAS,$AS"
  fi
done
node scripts/db-audit/compose-confirm-hash.mjs \
  --versions "$VERSIONS" \
  --runtime-shas "$RUNTIME_SHAS" \
  --arquivo-shas "$ARQUIVO_SHAS" \
  --commit "$COMMIT_SHA"
