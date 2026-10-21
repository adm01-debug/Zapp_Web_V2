#!/usr/bin/env bash
# GA14: calcula o conjunto ausente do ledger (escopo do lote).
# Extraido do db-migrate.yml (etapa Calcular versions ausentes do ledger).
# Entrada por ambiente: TARGET_VERSION, APPLY, APPLY_ALL_MISSING.
# Saida: needs_apply + versions no GITHUB_OUTPUT e resumo no GITHUB_STEP_SUMMARY.
# Shell: mesmo do workflow (bash --noprofile --norc -euo pipefail).
set -euo pipefail

umask 077
find supabase/migrations -maxdepth 1 -type f -name '*.sql' \
  -printf '%f\n' | cut -c1-14 | sort -u > /tmp/local-versions
node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
  -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version" \
  > /tmp/remote-versions
comm -13 /tmp/local-versions /tmp/remote-versions > /tmp/remote-only-versions
REMOTE_ONLY_COUNT=$(wc -l < /tmp/remote-only-versions | tr -d ' ')
if [ "$REMOTE_ONLY_COUNT" != "0" ]; then
  echo "::error::O ledger remoto possui versions sem arquivo local; db push foi bloqueado antes do CLI."
  echo "remote_only_count=$REMOTE_ONLY_COUNT"
  exit 1
fi
comm -23 /tmp/local-versions /tmp/remote-versions > /tmp/missing-versions
MISSING_COUNT=$(wc -l < /tmp/missing-versions | tr -d ' ')
MISSING_CSV=$(paste -sd, /tmp/missing-versions)
if [ "$APPLY_ALL_MISSING" = "true" ]; then
  # GA14: o escopo e o ledger, nao listas no YAML. Cada ausente precisa
  # mapear para exatamente um arquivo local.
  while IFS= read -r v; do
    [ -z "$v" ] && continue
    FILE_COUNT=$(find supabase/migrations -maxdepth 1 -type f \
      -name "${v}_*.sql" | wc -l | tr -d ' ')
    if [ "$FILE_COUNT" != "1" ]; then
      echo "::error::A versao ausente $v nao mapeia para exatamente um arquivo local."
      exit 1
    fi
  done < /tmp/missing-versions
  if [ "$MISSING_COUNT" = "0" ]; then
    NEEDS_APPLY=false
    VERSIONS_CSV=""
  else
    NEEDS_APPLY=true
    VERSIONS_CSV="$MISSING_CSV"
  fi
else
  # GA14: bundles fixos removidos; alvo unico ou nada pendente.
  MISSING_VERSION=$(sed -n '1p' /tmp/missing-versions)
  if [ "$MISSING_COUNT" = "1" ] && [ "$MISSING_VERSION" = "$TARGET_VERSION" ]; then
    NEEDS_APPLY=true
    VERSIONS_CSV="$TARGET_VERSION"
  elif [ "$MISSING_COUNT" = "0" ] && grep -Fxq "$TARGET_VERSION" /tmp/remote-versions; then
    NEEDS_APPLY=false
    VERSIONS_CSV="$TARGET_VERSION"
  else
    echo "::error::O conjunto de versions ausentes nao corresponde exatamente ao alvo informado (missing=$MISSING_COUNT). Para aplicar varias versions de uma vez, marque apply_all_missing."
    exit 1
  fi
  FILE_COUNT=$(find supabase/migrations -maxdepth 1 -type f \
    -name "${TARGET_VERSION}_*.sql" | wc -l | tr -d ' ')
  if [ "$FILE_COUNT" != "1" ]; then
    echo "::error::A versao alvo precisa mapear para exatamente um arquivo local."
    exit 1
  fi
fi
TARGET_NAME=""
if [ -n "$TARGET_VERSION" ] && [ "$APPLY_ALL_MISSING" != "true" ]; then
  TARGET_FILE=$(find supabase/migrations -maxdepth 1 -type f \
    -name "${TARGET_VERSION}_*.sql" -printf '%f\n')
  TARGET_NAME=${TARGET_FILE#${TARGET_VERSION}_}
  TARGET_NAME=${TARGET_NAME%.sql}
fi
if [ "$APPLY" = "true" ] && [ "$NEEDS_APPLY" != "true" ]; then
  echo "::error::A migration alvo ja esta registrada; apply repetido foi bloqueado."
  exit 1
fi
echo "needs_apply=$NEEDS_APPLY" >> "$GITHUB_OUTPUT"
echo "versions=$VERSIONS_CSV" >> "$GITHUB_OUTPUT"
{
  echo "### Preflight do lote"
  echo ""
  echo "- needs_apply: \`$NEEDS_APPLY\`"
  echo "- versions: \`$VERSIONS_CSV\`"
  echo "- missing_count: \`$MISSING_COUNT\`"
  echo "- target_name: \`$TARGET_NAME\`"
} >> "$GITHUB_STEP_SUMMARY"
echo "OK: estado das migrations confirmado: needs_apply=$NEEDS_APPLY versions=$VERSIONS_CSV"
