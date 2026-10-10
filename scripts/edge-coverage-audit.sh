#!/bin/bash
# Régua de cobertura de linhas dos helpers de autorização das Edge Functions.
# Mede cobertura de linhas de supabase/functions/_shared/*authz*/*auth* e
# grava o número em docs/audits/. Segunda execução idêntica é reproduzível
# porque os testes são determinísticos e o perfil de cobertura é o mesmo.
set -euo pipefail

WORKSPACE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$WORKSPACE"

COV_DIR="/tmp/edge-coverage-authz-$$"
mkdir -p "$COV_DIR"

TEST_FILES=(
  supabase/functions/_shared/__tests__/ai-auth.test.ts
  supabase/functions/_shared/__tests__/ai-audio-authz.test.ts
  supabase/functions/_shared/__tests__/cron-secret-authz-l5.test.ts
  supabase/functions/_shared/__tests__/evolution-control-authz.test.ts
  supabase/functions/_shared/__tests__/voice-copilot-authz.test.ts
)

# Roda os testes com coleta de cobertura. Falhas de teste não abortam a
# geração do relatório — o perfil de cobertura é gravado antes do exit.
deno test --config scripts/ci/deno.json --allow-env --coverage="$COV_DIR" \
  "${TEST_FILES[@]}" 2>&1 || true

# Gera o relatório LCOV e extrai apenas os helpers de autorização.
AUTHZ_FILES=(
  ai-auth.ts
  ai-audio-authz.ts
  cron-secret-auth.ts
  evolution-control-authz.ts
  voice-copilot-authz.ts
)

REPORT=$(deno coverage "$COV_DIR" --lcov 2>/dev/null)

# Monta o relatório em markdown.
{
  echo "# Cobertura de linhas — helpers de autorização das Edge Functions"
  echo ""
  echo "Medição: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""
  echo "| Arquivo | Linhas |"
  echo "|---|---|"

  for f in "${AUTHZ_FILES[@]}"; do
    # Extrai LF e LH para este arquivo do LCOV
    lf=$(echo "$REPORT" | awk -v file="$f" '
      /^SF:/ { sf=$0; sub(/^SF:/, "", sf) }
      /^LF:/ { lf=$0; sub(/^LF:/, "", lf) }
      /^LH:/ { lh=$0; sub(/^LH:/, "", lh) }
      /^end_of_record/ {
        if (sf ~ file"$") { print lf, lh }
      }
    ')
    total=$(echo "$lf" | awk '{print $1}')
    hit=$(echo "$lf" | awk '{print $2}')
    if [ -n "$total" ] && [ "$total" -gt 0 ] 2>/dev/null; then
      pct=$(awk "BEGIN { printf \"%.1f\", ($hit / $total) * 100 }")
    else
      pct="0.0"
    fi
    echo "| ${f} | ${pct}% |"
  done

  echo ""
  echo "Fonte: deno coverage sobre o perfil de \"$COV_DIR\"."
} > docs/audits/edge-functions-authz-coverage.md

# Limpeza do perfil temporário.
rm -rf "$COV_DIR"